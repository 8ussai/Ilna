import gc
import json
import threading
import time

# first, so the models folder is set before the Hugging Face libraries load
import backend.backendConfig  # noqa: F401

import ctranslate2
from faster_whisper import WhisperModel
from langchain_core.documents import Document

from backend.database import SessionLocal
from backend.models.course import CourseMaterial, MaterialTranscript
from backend.services.embeddings import TORCH_THREADS, delete_material_vectors, get_vectorstore

WHISPER_MODEL = "large-v3-turbo"

# production runs on a GPU; development laptops fall back to the CPU with 8-bit weights
if ctranslate2.get_cuda_device_count() > 0:
    DEVICE, COMPUTE_TYPE = "cuda", "float16"
else:
    DEVICE, COMPUTE_TYPE = "cpu", "int8"

# transcript segments are merged into chunks about this long before embedding, like document chunks
CHUNK_CHARS = 1500

# write progress at most this often, so a long lecture isn't thousands of tiny commits
PROGRESS_EVERY_SEC = 2

_model_lock = threading.Lock()
_model = None


class _MaterialDeleted(Exception):
    pass


def _get_model() -> WhisperModel:
    """Loads Whisper (~1.5 GB) the first time a recording is transcribed, not at server start."""
    global _model
    with _model_lock:
        if _model is None:
            _model = WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type=COMPUTE_TYPE, cpu_threads=TORCH_THREADS)
        return _model


def _release_model_on_cpu():
    # on a laptop, Whisper and the embedding model together can exhaust memory, so Whisper is
    # unloaded before indexing; a GPU server keeps it loaded for the next recording
    global _model
    if DEVICE == "cpu":
        with _model_lock:
            _model = None
        gc.collect()


def _chunks(segments, material_id: int, course_id: int):
    """Merges consecutive segments into ~CHUNK_CHARS documents that remember where they start and end."""
    chunks, texts, start = [], [], None
    for segment in segments:
        if start is None:
            start = segment["start"]
        texts.append(segment["text"])
        if sum(len(text) for text in texts) >= CHUNK_CHARS or segment is segments[-1]:
            chunks.append(Document(
                page_content=" ".join(texts),
                metadata={
                    "material_id": material_id,
                    "course_id": course_id,
                    "kind": "audio",
                    "start_sec": start,
                    "end_sec": segment["end"],
                },
            ))
            texts, start = [], None
    return chunks


def _transcript_row(db, material_id: int) -> MaterialTranscript:
    transcript = db.query(MaterialTranscript).filter(MaterialTranscript.material_id == material_id).first()
    if transcript is None:
        raise _MaterialDeleted()
    return transcript


def index_transcript(material_id: int):
    """Embeds a finished transcript for AI search. A failure here keeps the transcript; it's retried on restart."""
    db = SessionLocal()
    try:
        material = db.get(CourseMaterial, material_id)
        transcript = _transcript_row(db, material_id)
        if material is None or transcript.status != "done":
            return

        # replace, not add, so a retry never leaves the old transcript's vectors behind
        delete_material_vectors(material_id)
        chunks = _chunks(json.loads(transcript.segments or "[]"), material_id, material.course_id)
        if chunks:
            get_vectorstore().add_documents(chunks, ids=[f"{material_id}-{i}" for i in range(len(chunks))])

        material = db.get(CourseMaterial, material_id)
        if material is None:
            raise _MaterialDeleted()
        material.is_rag_indexed = True
        _transcript_row(db, material_id).error = None
        db.commit()
        print(f"[Transcribe] Indexed material {material_id} ({len(chunks)} chunks)")

    except _MaterialDeleted:
        db.rollback()
        delete_material_vectors(material_id)
        print(f"[Transcribe] Material {material_id} was deleted during indexing")

    except Exception as e:
        db.rollback()
        print(f"[Transcribe] Indexing failed for material {material_id}: {e}")
        transcript = db.query(MaterialTranscript).filter(MaterialTranscript.material_id == material_id).first()
        if transcript is not None:
            # the transcript itself is fine and stays "done"; only AI search is missing it
            transcript.error = f"Transcript saved, but indexing it for AI failed: {e}"[:500]
            db.commit()

    finally:
        db.close()


def transcribe_material(material_id: int):
    """Transcribes a recording, saves its timestamped segments, then indexes them for AI search."""
    db = SessionLocal()
    try:
        material = db.get(CourseMaterial, material_id)
        if material is None:
            return
        transcript = _transcript_row(db, material_id)
        file_path = material.file_path

        transcript.status = "processing"
        transcript.progress = 0
        transcript.error = None
        db.commit()

        print(f"[Transcribe] Starting material {material_id} on {DEVICE}...")
        started = time.time()

        # condition_on_previous_text=False stops one misheard line from repeating through the rest of a long lecture
        segment_iter, info = _get_model().transcribe(
            file_path,
            language=transcript.language,
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
        )

        segments, last_write = [], 0.0
        for segment in segment_iter:
            text = segment.text.strip()
            if text:
                segments.append({"start": round(segment.start, 2), "end": round(segment.end, 2), "text": text})
            if info.duration and time.time() - last_write >= PROGRESS_EVERY_SEC:
                transcript = _transcript_row(db, material_id)
                transcript.progress = min(segment.end / info.duration, 0.99)
                db.commit()
                last_write = time.time()

        print(f"[Transcribe] Material {material_id}: {info.duration:.0f}s of audio in {time.time() - started:.0f}s, "
              f"language {info.language}, {len(segments)} segments")

        transcript = _transcript_row(db, material_id)
        transcript.segments = json.dumps(segments, ensure_ascii=False)
        transcript.language = info.language
        transcript.progress = 1
        transcript.status = "done"
        material = db.get(CourseMaterial, material_id)
        if material is None:
            raise _MaterialDeleted()
        # uploaded files (not browser recordings) arrive without a length
        if material.duration_sec is None:
            material.duration_sec = round(info.duration, 2)
        db.commit()

    except _MaterialDeleted:
        db.rollback()
        print(f"[Transcribe] Material {material_id} was deleted during transcription")
        return

    except Exception as e:
        db.rollback()
        print(f"[Transcribe] Error on material {material_id}: {e}")
        transcript = db.query(MaterialTranscript).filter(MaterialTranscript.material_id == material_id).first()
        if transcript is not None:
            transcript.status = "failed"
            transcript.error = str(e)[:500]
            db.commit()
        return

    finally:
        db.close()
        _release_model_on_cpu()

    index_transcript(material_id)
