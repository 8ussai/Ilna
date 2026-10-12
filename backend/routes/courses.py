import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from fastapi import BackgroundTasks 

from backend.database import get_db
from backend.backendConfig import ALLOWED_EXTENSIONS, STORAGE_LIMIT_BYTES
from backend.models.user import User
from backend.models.course import Course, CourseNote, CourseLink, CourseMaterial
from backend.schemas.course import (
    CourseCreate,
    CourseOut,
    CourseNoteCreate,
    CourseNoteOut,
    CourseLinkCreate,
    CourseLinkOut,
    CourseMaterialOut,
    CourseDetailOut
)
from backend.core.apiDependencies import get_current_user
from backend.services.rag_pipeline import index_course_material
from backend.services.quiz_generator import generate_quiz_from_material
from backend.services.storage import storage_used

router = APIRouter()

UPLOAD_CHUNK_BYTES = 1024 * 1024


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
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with id {course_id} not found."
        )
        
    if course.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this course."
        )
        
    return course


@router.post("/{course_id}/notes", response_model=CourseNoteOut, status_code=status.HTTP_201_CREATED)
def add_course_note(
    course_id: int,
    note_data: CourseNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with id {course_id} not found."
        )
        
    if course.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this course."
        )
        
    new_note = CourseNote(
        course_id=course_id,
        title=note_data.title,
        content=note_data.content
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    return new_note


@router.post("/{course_id}/links", response_model=CourseLinkOut, status_code=status.HTTP_201_CREATED)
def add_course_link(
    course_id: int,
    link_data: CourseLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with id {course_id} not found."
        )
        
    if course.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this course."
        )
        
    new_link = CourseLink(
        course_id=course_id,
        title=link_data.title,
        url=link_data.url
    )

    db.add(new_link)
    db.commit()
    db.refresh(new_link)

    return new_link


@router.post("/{course_id}/upload", response_model=CourseMaterialOut, status_code=status.HTTP_201_CREATED)
def upload_course_material(
    course_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with id {course_id} not found."
        )
        
    if course.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this course."
        )

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

@router.get("/{course_id}/materials/{material_id}/quiz")
def generate_ai_quiz(
    course_id: int,
    material_id: int,
    num_questions: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    material = db.query(CourseMaterial).filter(
        CourseMaterial.id == material_id, 
        CourseMaterial.course_id == course_id
    ).first()
    
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found.")

    quiz_result = generate_quiz_from_material(material_id, num_questions)
    
    if isinstance(quiz_result, dict) and "error" in quiz_result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=quiz_result["error"]
        )

    return quiz_result