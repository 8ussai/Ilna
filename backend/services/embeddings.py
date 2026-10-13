import os
import threading

import chromadb
import torch
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from backend.backendConfig import CHROMA_DB_DIR

EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B"
# named after the model: vectors from another model can't share a collection (different sizes and meaning)
COLLECTION_NAME = "course_chunks_qwen3"

# Qwen3 is instruction-aware: queries get a task line, stored chunks don't
QUERY_PROMPT = "Instruct: Given a request about a university course, retrieve passages from the course material that answer it\nQuery:"

# production runs on a GPU; development laptops fall back to the CPU
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# on CPU, leave half the cores for the API while a file is being indexed
TORCH_THREADS = max(1, (os.cpu_count() or 2) // 2)

_lock = threading.Lock()
_client = None
_vectorstore = None


def get_chroma_client():
    global _client
    with _lock:
        if _client is None:
            _client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
        return _client


def _get_collection():
    return get_chroma_client().get_or_create_collection(COLLECTION_NAME, metadata={"hnsw:space": "cosine"})


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
                collection_name=COLLECTION_NAME,
                embedding_function=embeddings,
                collection_metadata={"hnsw:space": "cosine"},
            )
        return _vectorstore


# deleting goes straight to Chroma, so it never loads the model
def delete_material_vectors(material_id: int):
    _get_collection().delete(where={"material_id": material_id})


def delete_course_vectors(course_id: int):
    _get_collection().delete(where={"course_id": course_id})
