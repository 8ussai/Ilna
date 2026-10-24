"""Keeps typed notes searchable by the AI features.

Notes autosave about once a second while someone types, so a note is only embedded after it has
been quiet for NOTE_INDEX_DELAY_SEC. `indexed_at` records the last embedding; a note whose
`updated_at` is newer is re-embedded on the next server start if a restart cut the wait short.
Drawings aren't embedded (there's no text to read until handwriting recognition exists).
"""

import threading

from langchain_core.documents import Document
from sqlalchemy import func

from backend.config import NOTE_INDEX_DELAY_SEC
from backend.core import jobs
from backend.courses.embeddings import delete_note_vectors, get_vectorstore
from backend.courses.models import CourseNote
from backend.courses.rag_pipeline import index_estimate_sec, text_splitter
from backend.database import SessionLocal

_timers_lock = threading.Lock()
_timers: dict[int, threading.Timer] = {}


def schedule_note_index(note_id: int, delay: float = NOTE_INDEX_DELAY_SEC):
    """(Re)starts the quiet-period timer for a note; the last save in a burst is the one embedded."""
    with _timers_lock:
        previous = _timers.pop(note_id, None)
        if previous is not None:
            previous.cancel()
        timer = threading.Timer(delay, _queue_index, args=(note_id,))
        timer.daemon = True
        _timers[note_id] = timer
        timer.start()


# stops a note's pending indexing, e.g. when it's deleted
def cancel_note_index(note_id: int):
    with _timers_lock:
        timer = _timers.pop(note_id, None)
        if timer is not None:
            timer.cancel()


# queues a note for indexing once its wait is over
def _queue_index(note_id: int):
    with _timers_lock:
        _timers.pop(note_id, None)
    queue_note_index(note_id)


def queue_note_index(note_id: int):
    """Puts a note on the index line for its course owner, sized by its text (a gone note still runs, to clear it)."""
    db = SessionLocal()
    try:
        note = db.get(CourseNote, note_id)
        user_id = note.course.user_id if note is not None else None
        chars = len(note.title or "") + len(note.content or "") if note is not None and note.kind == "text" else 0
    finally:
        db.close()
    jobs.submit(index_note, note_id, line=jobs.INDEX, user_id=user_id, estimate_sec=index_estimate_sec(chars))


def index_note(note_id: int):
    """Replaces a note's vectors with its current text (none if it's empty, a drawing, or gone)."""
    db = SessionLocal()
    try:
        note = db.get(CourseNote, note_id)
        # replace, not add, so an edit never leaves the old text's vectors behind
        delete_note_vectors(note_id)
        if note is None or note.kind != "text":
            return

        seen_title, seen_content = note.title, note.content
        text = "\n\n".join(part for part in (note.title, note.content) if part and part.strip())
        chunks = [
            Document(page_content=chunk, metadata={"note_id": note.id, "course_id": note.course_id, "kind": "note"})
            for chunk in text_splitter.split_text(text)
        ]
        if chunks:
            get_vectorstore().add_documents(chunks, ids=[f"note-{note.id}-{i}" for i in range(len(chunks))])

        # setting updated_at to itself stops its onupdate, so recording the embedding doesn't count as an edit.
        # Only when the text is still what was embedded: an edit that landed meanwhile leaves the note stale,
        # and its own timer embeds it again. func.now() matches how updated_at is stored, so the two compare.
        same_title = CourseNote.title.is_(None) if seen_title is None else CourseNote.title == seen_title
        db.query(CourseNote).filter(CourseNote.id == note_id, same_title, CourseNote.content == seen_content).update(
            {CourseNote.indexed_at: func.now(), CourseNote.updated_at: CourseNote.updated_at},
            synchronize_session=False,
        )
        db.commit()
        print(f"[Notes] Indexed note {note_id} ({len(chunks)} chunks)")
    except Exception as e:
        db.rollback()
        # indexed_at stays behind updated_at, so the next start tries again
        print(f"[Notes] Indexing failed for note {note_id}: {e}")
    finally:
        db.close()


def stale_note_ids(db) -> list[int]:
    """Typed notes changed since they were last embedded (or never embedded)."""
    rows = (
        db.query(CourseNote.id)
        .filter(
            CourseNote.kind == "text",
            (CourseNote.indexed_at.is_(None)) | (CourseNote.indexed_at < CourseNote.updated_at),
        )
        .order_by(CourseNote.id)
        .all()
    )
    return [note_id for (note_id,) in rows]
