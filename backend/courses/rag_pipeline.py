from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredPowerPointLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.config import CHUNK_CHARS, CHUNK_OVERLAP_CHARS, DOCUMENT_BYTES_PER_CHUNK, INDEX_SEC_PER_CHUNK
from backend.core import jobs
from backend.courses.embeddings import delete_material_vectors, get_vectorstore
from backend.courses.models import CourseMaterial
from backend.database import SessionLocal

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_CHARS,
    chunk_overlap=CHUNK_OVERLAP_CHARS,
    length_function=len,
)


# the loader for a document's file type
def get_document_loader(file_path: str):
    file_extension = file_path.split(".")[-1].lower()

    if file_extension == "pdf":
        return PyPDFLoader(file_path)
    elif file_extension in ["pptx", "ppt"]:
        return UnstructuredPowerPointLoader(file_path)
    else:
        return None


def index_estimate_sec(chars: int) -> float:
    """Roughly how long embedding this much text takes, so the index line can put small jobs first."""
    return max(1, -(-chars // CHUNK_CHARS)) * INDEX_SEC_PER_CHUNK


def queue_document_index(material_id: int):
    """Puts a document on the index line for its course owner, sized by its file size."""
    db = SessionLocal()
    try:
        material = db.get(CourseMaterial, material_id)
        if material is None:
            return
        args = (material.file_path, material.id, material.course_id)
        user_id = material.course.user_id
        chunks = max(1, (material.size_bytes or 0) // DOCUMENT_BYTES_PER_CHUNK)
    finally:
        db.close()
    jobs.submit(
        index_course_material, *args, line=jobs.INDEX, user_id=user_id, estimate_sec=chunks * INDEX_SEC_PER_CHUNK
    )


def _set_indexed(material_id: int) -> bool:
    """Marks the material as indexed; False when it was deleted while indexing ran."""
    db = SessionLocal()
    try:
        material = db.get(CourseMaterial, material_id)
        if material is None:
            return False
        material.is_rag_indexed = True
        db.commit()
        return True
    finally:
        db.close()


# reads a document, splits it into chunks and stores their vectors for the AI
def index_course_material(file_path: str, material_id: int, course_id: int):
    try:
        loader = get_document_loader(file_path)

        if loader is None:
            print(f"[RAG] Skipping AI indexing for {file_path}. Format not supported by AI.")
            return False

        print(f"[RAG] Starting AI indexing for material ID: {material_id} (Format: {file_path.split('.')[-1]})...")

        documents = loader.load()

        for doc in documents:
            doc.metadata["material_id"] = material_id
            doc.metadata["course_id"] = course_id
            doc.metadata["kind"] = "document"

        chunks = text_splitter.split_documents(documents)
        print(f"[RAG] File split into {len(chunks)} chunks.")

        # replace, not add, so re-indexing the same material never leaves duplicates
        delete_material_vectors(material_id)
        if chunks:
            get_vectorstore().add_documents(chunks, ids=[f"{material_id}-{i}" for i in range(len(chunks))])

        if not _set_indexed(material_id):
            # deleted while we were indexing; its delete already ran, so clean up what we just added
            delete_material_vectors(material_id)
            print(f"[RAG] Material {material_id} was deleted during indexing; vectors removed")
            return False

        print(f"[RAG] Successfully indexed material {material_id} into Vector DB")
        return True

    except Exception as e:
        print(f"[RAG] Error indexing material {material_id}: {str(e)}")
        return False
