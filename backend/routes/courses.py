import math
import mimetypes
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.database import get_db
from backend.backendConfig import ALLOWED_EXTENSIONS, AUDIO_EXTENSIONS, DOCUMENT_EXTENSIONS, STORAGE_LIMIT_BYTES
from backend.models.user import User
from backend.models.course import Course, CourseNote, CourseLink, CourseMaterial, MaterialTranscript
from backend.schemas.course import (
    CourseCreate,
    CourseUpdate,
    CourseOut,
    CourseSummaryOut,
    MaterialKind,
    NoteKind,
    TranscriptOut,
    TranscriptRetry,
    TranscriptStatus,
    check_note_content,
    CourseNoteCreate,
    CourseNoteUpdate,
    CourseNoteOut,
    CourseLinkCreate,
    CourseLinkUpdate,
    CourseLinkOut,
    CourseMaterialOut,
    CourseMaterialUpdate,
    CourseDetailOut
)
from backend.core.apiDependencies import get_current_user
from backend.services.embeddings import delete_course_vectors, delete_material_vectors, delete_note_vectors
from backend.services.note_index import cancel_note_index, schedule_note_index
from backend.services import jobs
from backend.services.rag_pipeline import index_course_material
from backend.services.transcription import transcribe_material
from backend.services.quiz_generator import generate_quiz_from_material
from backend.services.storage import storage_used

router = APIRouter()

UPLOAD_CHUNK_BYTES = 1024 * 1024

# languages a recording can be transcribed as; anything else is detected
TRANSCRIPT_LANGUAGES = {"ar", "en"}


def get_owned_course(db: Session, course_id: int, user: User) -> Course:
    """The course, if it exists and belongs to the user; 404 or 403 otherwise."""
    course = db.query(Course).filter(Course.id == course_id).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with id {course_id} not found."
        )

    if course.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this course."
        )

    return course


def _get_course_item(db: Session, model, item_id: int, course: Course, label: str):
    """A material, note or link of the course; 404 when it belongs to another course."""
    item = db.query(model).filter(model.id == item_id, model.course_id == course.id).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} with id {item_id} not found in this course."
        )

    return item


def _remove_files(paths: List[str]):
    # runs after the commit, so a failed delete never leaves rows pointing at missing files
    for path in paths:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


def _remove_vectors(delete, item_id: int):
    # the rows are already gone, so a vector store hiccup is logged rather than failing the request
    try:
        delete(item_id)
    except Exception as e:
        print(f"[RAG] Could not delete vectors for {delete.__name__}({item_id}): {e}")


def _apply_update(item, changes):
    # only the fields the client sent are changed
    for field, value in changes.model_dump(mode="json", exclude_unset=True).items():
        setattr(item, field, value)


@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    course_data: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_course = Course(user_id=current_user.id, **course_data.model_dump(mode="json"))

    db.add(new_course)
    db.commit()
    db.refresh(new_course)

    return new_course


def _count_in_course(model, *conditions):
    return (
        select(func.count(model.id))
        .where(model.course_id == Course.id, *conditions)
        .correlate(Course)
        .scalar_subquery()
    )


@router.get("/", response_model=List[CourseSummaryOut])
def get_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rows = (
        db.query(
            Course,
            _count_in_course(CourseMaterial, CourseMaterial.kind == MaterialKind.document.value),
            _count_in_course(CourseMaterial, CourseMaterial.kind == MaterialKind.audio.value),
            _count_in_course(CourseLink),
            _count_in_course(CourseNote),
        )
        .filter(Course.user_id == current_user.id)
        # recently opened first; never-opened courses after them, newest change first
        .order_by(Course.last_opened_at.is_(None), Course.last_opened_at.desc(), Course.updated_at.desc())
        .all()
    )

    return [
        CourseSummaryOut(
            **CourseOut.model_validate(course).model_dump(),
            documents_count=documents,
            audio_count=audio,
            links_count=links,
            notes_count=notes,
        )
        for course, documents, audio, links, notes in rows
    ]


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course_detail(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)

    # setting updated_at to itself stops its onupdate, so opening a course doesn't count as changing it
    db.query(Course).filter(Course.id == course.id).update(
        {Course.last_opened_at: datetime.now(timezone.utc), Course.updated_at: Course.updated_at},
        synchronize_session=False,
    )
    db.commit()
    db.refresh(course)

    return course


# what the course page polls while files are indexing or recordings are transcribing;
# unlike the detail route it doesn't count as opening the course
@router.get("/{course_id}/materials", response_model=List[CourseMaterialOut])
def get_course_materials(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    return course.materials


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(
    course_id: int,
    changes: CourseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    _apply_update(course, changes)

    db.commit()
    db.refresh(course)

    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    file_paths = [material.file_path for material in course.materials]

    # materials, notes and links go with it through the cascade
    db.delete(course)
    db.commit()

    _remove_files(file_paths)
    _remove_vectors(delete_course_vectors, course_id)


@router.post("/{course_id}/notes", response_model=CourseNoteOut, status_code=status.HTTP_201_CREATED)
def add_course_note(
    course_id: int,
    note_data: CourseNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    get_owned_course(db, course_id, current_user)

    new_note = CourseNote(
        course_id=course_id,
        title=note_data.title,
        kind=note_data.kind.value,
        content=note_data.content
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    if new_note.kind == NoteKind.text.value:
        schedule_note_index(new_note.id)

    return new_note


@router.patch("/{course_id}/notes/{note_id}", response_model=CourseNoteOut)
def update_course_note(
    course_id: int,
    note_id: int,
    changes: CourseNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    note = _get_course_item(db, CourseNote, note_id, course, "Note")

    if changes.content is not None:
        try:
            check_note_content(note.kind, changes.content)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    _apply_update(note, changes)

    db.commit()
    db.refresh(note)

    if note.kind == NoteKind.text.value:
        schedule_note_index(note.id)

    return note


@router.delete("/{course_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_note(
    course_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    note = _get_course_item(db, CourseNote, note_id, course, "Note")

    db.delete(note)
    db.commit()

    cancel_note_index(note_id)
    _remove_vectors(delete_note_vectors, note_id)


@router.post("/{course_id}/links", response_model=CourseLinkOut, status_code=status.HTTP_201_CREATED)
def add_course_link(
    course_id: int,
    link_data: CourseLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    get_owned_course(db, course_id, current_user)

    new_link = CourseLink(
        course_id=course_id,
        title=link_data.title,
        url=link_data.url
    )

    db.add(new_link)
    db.commit()
    db.refresh(new_link)

    return new_link


@router.patch("/{course_id}/links/{link_id}", response_model=CourseLinkOut)
def update_course_link(
    course_id: int,
    link_id: int,
    changes: CourseLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    link = _get_course_item(db, CourseLink, link_id, course, "Link")
    _apply_update(link, changes)

    db.commit()
    db.refresh(link)

    return link


@router.delete("/{course_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_link(
    course_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    link = _get_course_item(db, CourseLink, link_id, course, "Link")

    db.delete(link)
    db.commit()


@router.post("/{course_id}/upload", response_model=CourseMaterialOut, status_code=status.HTTP_201_CREATED)
def upload_course_material(
    course_id: int,
    file: UploadFile = File(...),
    # audio only: length measured by the browser, and the lecture's language (empty = detect)
    duration_sec: Optional[float] = Form(None),
    language: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    get_owned_course(db, course_id, current_user)

    file_extension = file.filename.split('.')[-1].lower() if "." in file.filename else ""

    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '.{file_extension}' is not allowed."
        )

    is_audio = file_extension in AUDIO_EXTENSIONS

    if duration_sec is not None and (not is_audio or not math.isfinite(duration_sec) or duration_sec < 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="duration_sec must be a non-negative number, and only for audio."
        )

    language = language or None
    if language is not None and (not is_audio or language not in TRANSCRIPT_LANGUAGES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"language must be one of {sorted(TRANSCRIPT_LANGUAGES)}, and only for audio."
        )

    remaining = STORAGE_LIMIT_BYTES - storage_used(db, current_user.id)
    storage_full = HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail="This file would go over your storage limit.",
    )

    # the client-reported size can be missing or wrong, so this only rejects early; the copy below is the real check
    if file.size is not None and file.size > remaining:
        raise storage_full

    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = f"uploads/courses/{unique_filename}"

    size_bytes = 0
    try:
        with open(file_path, "wb") as buffer:
            while chunk := file.file.read(UPLOAD_CHUNK_BYTES):
                size_bytes += len(chunk)
                if size_bytes > remaining:
                    break
                buffer.write(chunk)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file: {str(e)}"
        )

    if size_bytes > remaining:
        os.remove(file_path)
        raise storage_full

    new_material = CourseMaterial(
        course_id=course_id,
        file_name=file.filename,
        file_path=file_path,
        kind=(MaterialKind.audio if is_audio else MaterialKind.document).value,
        mime_type=AUDIO_EXTENSIONS.get(file_extension) or DOCUMENT_EXTENSIONS[file_extension],
        duration_sec=duration_sec,
        size_bytes=size_bytes,
    )

    # recordings are transcribed before indexing; the transcript row tracks that work
    if is_audio:
        new_material.transcript = MaterialTranscript(status="pending", language=language)

    db.add(new_material)
    db.commit()
    db.refresh(new_material)

    if is_audio:
        jobs.submit(transcribe_material, new_material.id)
    else:
        jobs.submit(index_course_material, file_path, new_material.id, course_id)

    return new_material


@router.get("/{course_id}/materials/{material_id}/file")
def download_course_material(
    course_id: int,
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")

    if not os.path.isfile(material.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This file is missing from storage."
        )

    # the stored file keeps the real extension even after the material is renamed
    extension = os.path.splitext(material.file_path)[1]
    # files uploaded before mime_type existed fall back to a guess
    media_type = material.mime_type or mimetypes.guess_type(material.file_path)[0] or "application/octet-stream"
    file_name = material.file_name
    if not file_name.lower().endswith(extension.lower()):
        file_name += extension

    # inline so PDFs and audio open in the browser; FileResponse answers Range requests, so audio can seek
    return FileResponse(
        material.file_path,
        media_type=media_type,
        filename=file_name,
        content_disposition_type="inline",
    )


@router.patch("/{course_id}/materials/{material_id}", response_model=CourseMaterialOut)
def rename_course_material(
    course_id: int,
    material_id: int,
    changes: CourseMaterialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")
    material.file_name = changes.file_name

    db.commit()
    db.refresh(material)

    return material


@router.delete("/{course_id}/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_material(
    course_id: int,
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")
    file_path = material.file_path

    db.delete(material)
    db.commit()

    _remove_files([file_path])
    _remove_vectors(delete_material_vectors, material_id)


def _get_transcript(db: Session, course_id: int, material_id: int, user: User):
    course = get_owned_course(db, course_id, user)
    material = _get_course_item(db, CourseMaterial, material_id, course, "Material")

    if material.transcript is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Only recordings have a transcript."
        )

    return material.transcript


@router.get("/{course_id}/materials/{material_id}/transcript", response_model=TranscriptOut)
def get_material_transcript(
    course_id: int,
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return _get_transcript(db, course_id, material_id, current_user)


@router.post("/{course_id}/materials/{material_id}/transcript/retry", response_model=TranscriptOut)
def retry_material_transcript(
    course_id: int,
    material_id: int,
    retry: TranscriptRetry,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    transcript = _get_transcript(db, course_id, material_id, current_user)

    if transcript.status in (TranscriptStatus.pending.value, TranscriptStatus.processing.value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This recording is already being transcribed."
        )

    # a finished transcript can be redone too, e.g. in another language
    transcript.status = TranscriptStatus.pending.value
    transcript.progress = 0
    transcript.error = None
    transcript.segments = None
    transcript.language = retry.language
    transcript.material.is_rag_indexed = False
    db.commit()
    db.refresh(transcript)

    jobs.submit(transcribe_material, material_id)

    return transcript


@router.get("/{course_id}/materials/{material_id}/quiz")
def generate_ai_quiz(
    course_id: int,
    material_id: int,
    num_questions: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = get_owned_course(db, course_id, current_user)
    _get_course_item(db, CourseMaterial, material_id, course, "Material")

    quiz_result = generate_quiz_from_material(material_id, num_questions)

    if isinstance(quiz_result, dict) and "error" in quiz_result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=quiz_result["error"]
        )

    return quiz_result
