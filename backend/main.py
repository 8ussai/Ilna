from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles 

from backend.database import engine, Base
from backend.models import user, post, course
from backend.routes import auth, posts, courses, meta

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


app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(meta.router, prefix="/meta", tags=["Meta"])
app.include_router(posts.router, prefix="/posts", tags=["Posts"])
app.include_router(courses.router, prefix="/courses", tags=["Courses & Study Workspace"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}