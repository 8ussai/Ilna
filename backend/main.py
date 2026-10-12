import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from backend.database import engine, Base
from backend.models import user, post, course
from backend.routes import auth, me, posts, replies, courses, meta

from backend.backendConfig import UPLOAD_DIR 


app = FastAPI(
    title="ilna API",
    description="Academic Platform API for managing courses, users, and authentication.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # later we can restrict this to specific domains
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


app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(me.router, prefix="/me", tags=["Me"])
app.include_router(meta.router, prefix="/meta", tags=["Meta"])
app.include_router(posts.router, prefix="/posts", tags=["Posts"])
app.include_router(replies.router, tags=["Replies"])
app.include_router(courses.router, prefix="/courses", tags=["Courses & Study Workspace"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}