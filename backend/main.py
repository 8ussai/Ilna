from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from backend.database import engine, Base
from backend.models import user, post, course
from backend.routes import auth, posts, replies, courses, meta

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


app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(meta.router, prefix="/meta", tags=["Meta"])
app.include_router(posts.router, prefix="/posts", tags=["Posts"])
app.include_router(replies.router, tags=["Replies"])
app.include_router(courses.router, prefix="/courses", tags=["Courses & Study Workspace"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}