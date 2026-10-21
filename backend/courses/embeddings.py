import os
import threading

import chromadb
import torch
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

# first, so the models folder is set before the Hugging Face libraries load
from backend.config import CHROMA_COLLECTION_NAME, CHROMA_DB_DIR, EMBEDDING_MODEL

# Qwen3 is instruction-aware: queries get a task line, stored chunks don't
QUERY_PROMPT = "Instruct: Given a request about a university course, retrieve passages from the course material that answer it\nQuery:"

# production runs on a GPU; development laptops fall back to the CPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# on CPU, leave half the cores for the API while a file is being indexed
TORCH_THREADS = max(1, (os.cpu_count() or 2) // 2)

_lock = threading.Lock()
_client = None
_vectorstore = None


# the vector store client, opened on first use
def get_chroma_client():
    global _client
    with _lock:
        if _client is None:
            _client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
        return _client


# the collection course chunks are stored in
def _get_collection():
    return get_chroma_client().get_or_create_collection(CHROMA_COLLECTION_NAME, metadata={"hnsw:space": "cosine"})


def get_vectorstore() -> Chroma:
    """The course chunks store; loads the embedding model (~2.4 GB RAM) the first time it's called."""
    global _vectorstore
    client = get_chroma_client()
    with _lock:
        if _vectorstore is None:
            model_kwargs = {"device": DEVICE}
            if DEVICE == "cuda":
                # half precision: half the GPU memory and faster, with no meaningful loss for retrieval
                model_kwargs["model_kwargs"] = {"torch_dtype": torch.float16}
            else:
                torch.set_num_threads(TORCH_THREADS)
            embeddings = HuggingFaceEmbeddings(
                model_name=EMBEDDING_MODEL,
                model_kwargs=model_kwargs,
                encode_kwargs={"normalize_embeddings": True, "batch_size": 8},
                query_encode_kwargs={"normalize_embeddings": True, "prompt": QUERY_PROMPT},
            )
            _vectorstore = Chroma(
                client=client,
                collection_name=CHROMA_COLLECTION_NAME,
                embedding_function=embeddings,
                collection_metadata={"hnsw:space": "cosine"},
            )
        return _vectorstore


def material_chunks(material_id: int) -> list[tuple[str, dict]]:
    """A material's stored text as (chunk, metadata), in the order it was indexed. Reads Chroma directly,
    so it never loads the embedding model."""
    result = _get_collection().get(where={"material_id": material_id}, include=["documents", "metadatas"])
    rows = zip(result["ids"], result["documents"], result["metadatas"])
    # ids are "<material id>-<chunk number>"
    return [(text, metadata) for _, text, metadata in sorted(rows, key=lambda row: int(row[0].rsplit("-", 1)[1]))]


# deleting goes straight to Chroma, so it never loads the model
def delete_material_vectors(material_id: int):
    _get_collection().delete(where={"material_id": material_id})


# runs a vector delete once the rows are gone; a vector store hiccup is logged rather than failing the request
def remove_vectors(delete, item_id: int) -> None:
    try:
        delete(item_id)
    except Exception as e:
        print(f"[RAG] Could not delete vectors for {delete.__name__}({item_id}): {e}")


# deletes a note's vectors
def delete_note_vectors(note_id: int):
    _get_collection().delete(where={"note_id": note_id})


# deletes all of a course's vectors
def delete_course_vectors(course_id: int):
    _get_collection().delete(where={"course_id": course_id})
