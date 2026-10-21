from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.database import SessionLocal, utc_now
from backend.migrations.runner import run_migrations
# imported so every model is registered with Base; contact_model is aliased to not clash with routes.contact
from backend.models import user, post, course, notification, study as study_model, contact as contact_model, admin as admin_model
from backend.routes import admin, admin_maintenance, auth, contact, friends, me, posts, replies, reports, courses, meta, study

from backend.models.course import CourseMaterial, MaterialTranscript
from backend.services import jobs, study_generator
from backend.services import maintenance
from backend.services.admin_account import get_admin_account
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

# what still answers while the site is closed: the admin panel, the status check the app polls, the catalog, docs
MAINTENANCE_OPEN_PATHS = ("/admin", "/meta", "/health", "/docs", "/redoc", "/openapi.json")


async def _maintenance_gate(request: Request, call_next):
    """While a maintenance window is on, every student request gets 503 with the message and end time,
    except a test user's login opened from the admin panel."""
    if request.method == "OPTIONS" or request.url.path.startswith(MAINTENANCE_OPEN_PATHS):
        return await call_next(request)
    window = maintenance.current_window()
    if window is None or maintenance.state(window) != "on":
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and maintenance.allows_bypass(auth[7:].strip()):
        return await call_next(request)
    seconds_left = max(1, int((window.ends_at - utc_now()).total_seconds()))
    return JSONResponse(
        status_code=503,
        content={"detail": maintenance.closed_detail(window)},
        headers={"Retry-After": str(seconds_left)},
    )


# added before CORS so CORS wraps it, and the browser can read the 503 from another origin
app.add_middleware(BaseHTTPMiddleware, dispatch=_maintenance_gate)

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

run_migrations()

with SessionLocal() as _db:
    get_admin_account(_db)


# no public file mount: course files are only served to their owner, by /courses/{id}/materials/{mid}/file

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(me.router, prefix="/me", tags=["Me"])
app.include_router(meta.router, prefix="/meta", tags=["Meta"])
app.include_router(posts.router, prefix="/posts", tags=["Posts"])
app.include_router(replies.router, tags=["Replies"])
app.include_router(reports.router, tags=["Reports"])
app.include_router(courses.router, prefix="/courses", tags=["Courses & Study Workspace"])
app.include_router(study.router, prefix="/courses", tags=["Summaries & Quizzes"])
app.include_router(contact.router, prefix="/contact", tags=["Contact"])
app.include_router(friends.router, tags=["Friends"])
app.include_router(admin_maintenance.router, prefix="/admin/maintenance", tags=["Admin"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}
