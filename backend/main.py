import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from backend.database import engine, Base, SessionLocal
# imported so their tables exist before create_all; contact_model is aliased to not clash with routes.contact
from backend.models import user, post, course, notification, study as study_model, contact as contact_model
from backend.routes import auth, contact, me, posts, replies, courses, meta, study

from backend.models.course import CourseMaterial, MaterialTranscript
from backend.services import jobs, study_generator
from backend.services.note_index import index_note, stale_note_ids
from backend.services.rag_pipeline import index_course_material
from backend.services.transcription import index_transcript, transcribe_material


def _requeue_unfinished_work():
    """Jobs live in memory, so work cut off by a restart is found again here and queued."""
    db = SessionLocal()
    try:
        transcripts = (
            db.query(MaterialTranscript.material_id)
            .filter(MaterialTranscript.status.in_(["pending", "processing"]))
            .order_by(MaterialTranscript.id)
            .all()
        )
        # transcribed, but cut off (or failed) before it was indexed for AI
        unindexed_transcripts = (
            db.query(MaterialTranscript.material_id)
            .join(CourseMaterial, CourseMaterial.id == MaterialTranscript.material_id)
            .filter(MaterialTranscript.status == "done", CourseMaterial.is_rag_indexed.is_(False))
            .order_by(MaterialTranscript.id)
            .all()
        )
        notes = stale_note_ids(db)
        study_items = study_generator.requeue_unfinished(db)
        documents = (
            db.query(CourseMaterial.id, CourseMaterial.file_path, CourseMaterial.course_id)
            .filter(CourseMaterial.kind == "document", CourseMaterial.is_rag_indexed.is_(False))
            .order_by(CourseMaterial.id)
            .all()
        )
    finally:
        db.close()

    for (material_id,) in transcripts:
        jobs.submit(transcribe_material, material_id)
    for (material_id,) in unindexed_transcripts:
        jobs.submit(index_transcript, material_id)
    for material_id, file_path, course_id in documents:
        jobs.submit(index_course_material, file_path, material_id, course_id)
    for note_id in notes:
        jobs.submit(index_note, note_id)
    if transcripts or unindexed_transcripts or documents or notes:
        print(f"[Jobs] Re-queued {len(transcripts) + len(unindexed_transcripts)} recordings, "
              f"{len(documents)} documents and {len(notes)} notes")
    if study_items:
        print(f"[Study] Re-queued {study_items} summaries and quizzes")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _requeue_unfinished_work()
    yield


app = FastAPI(
    title="ilna API",
    description="Academic Platform API for managing courses, users, and authentication.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # the public site and the local dev/preview servers
    allow_origins=[
        "https://ilna-academic.com",
        "https://www.ilna-academic.com",
        "http://localhost:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# create_all doesn't add columns to existing tables, so add posts.scope to older databases
if "scope" not in {column["name"] for column in inspect(engine).get_columns("posts")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE posts ADD COLUMN scope VARCHAR NOT NULL DEFAULT 'general'"))

# same for course_materials.size_bytes; files uploaded before it existed get their size read from disk once
if "size_bytes" not in {column["name"] for column in inspect(engine).get_columns("course_materials")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE course_materials ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0"))
        for material_id, file_path in connection.execute(text("SELECT id, file_path FROM course_materials")).all():
            # a file missing from disk counts as 0
            size = os.path.getsize(file_path) if os.path.isfile(file_path) else 0
            connection.execute(
                text("UPDATE course_materials SET size_bytes = :size WHERE id = :id"),
                {"size": size, "id": material_id},
            )


def _add_missing_columns(table: str, columns: dict):
    """Adds each column (name -> SQL type and default) that the table doesn't have yet."""
    existing = {column["name"] for column in inspect(engine).get_columns(table)}
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))


# courses workspace: colors, kinds and recordings
_add_missing_columns("courses", {
    "color": "VARCHAR",
    "emoji": "VARCHAR",
    "last_opened_at": "DATETIME",
})
# every material uploaded before this was a pdf or ppt
_add_missing_columns("course_materials", {
    "kind": "VARCHAR NOT NULL DEFAULT 'document'",
    "mime_type": "VARCHAR",
    "duration_sec": "FLOAT",
})
# each kind of AI study item has its own daily limit now
_add_missing_columns("study_generations", {
    "kind": "VARCHAR",
})
_add_missing_columns("course_notes", {
    "kind": "VARCHAR NOT NULL DEFAULT 'text'",
    "indexed_at": "DATETIME",
})
# accounts made before sign-up codes existed count as verified
_add_missing_columns("users", {
    "is_verified": "BOOLEAN NOT NULL DEFAULT 1",
    "otp_hash": "VARCHAR",
    "otp_sent_at": "DATETIME",
    "otp_expires_at": "DATETIME",
    "otp_attempts": "INTEGER NOT NULL DEFAULT 0",
})


# no public file mount: course files are only served to their owner, by /courses/{id}/materials/{mid}/file

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(me.router, prefix="/me", tags=["Me"])
app.include_router(meta.router, prefix="/meta", tags=["Meta"])
app.include_router(posts.router, prefix="/posts", tags=["Posts"])
app.include_router(replies.router, tags=["Replies"])
app.include_router(courses.router, prefix="/courses", tags=["Courses & Study Workspace"])
app.include_router(study.router, prefix="/courses", tags=["Summaries & Quizzes"])
app.include_router(contact.router, prefix="/contact", tags=["Contact"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}
