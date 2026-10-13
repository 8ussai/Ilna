import mimetypes
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from fastapi import BackgroundTasks

from backend.database import get_db
from backend.backendConfig import ALLOWED_EXTENSIONS, STORAGE_LIMIT_BYTES
from backend.models.user import User
from backend.models.course import Course, CourseNote, CourseLink, CourseMaterial
from backend.schemas.course import (
    CourseCreate,
    CourseUpdate,
    CourseOut,
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
from backend.services.rag_pipeline import index_course_material
from backend.services.quiz_generator import generate_quiz_from_material
from backend.services.storage import storage_used

router = APIRouter()

UPLOAD_CHUNK_BYTES = 1024 * 1024


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


def _apply_update(item, changes):
    # only the fields the client sent are changed
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(item, field, value)


@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    course_data: CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_course = Course(
        user_id=current_user.id,
        title=course_data.title,
        description=course_data.description
    )

    db.add(new_course)
    db.commit()
    db.refresh(new_course)

    return new_course


@router.get("/", response_model=List[CourseOut])
def get_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    courses = (
        db.query(Course)
        .filter(Course.user_id == current_user.id)
        .order_by(Course.updated_at.desc())
        .all()
    )

    return courses


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course_detail(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_owned_course(db, course_id, current_user)


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
        content=note_data.content
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

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
    _apply_update(note, changes)

    db.commit()
    db.refresh(note)

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
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
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
        size_bytes=size_bytes,
    )

    db.add(new_material)
    db.commit()
    db.refresh(new_material)


    background_tasks.add_task(
        index_course_material,
        file_path=file_path,
        material_id=new_material.id,
        course_id=course_id
    )

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
    media_type = mimetypes.guess_type(material.file_path)[0] or "application/octet-stream"
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
