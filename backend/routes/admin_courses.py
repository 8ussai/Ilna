import json
import mimetypes
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.core.apiDependencies import get_admin
from backend.database import get_db
from backend.models.admin import AdminLog
from backend.models.course import Course, CourseMaterial, CourseMember
from backend.models.notification import Notification
from backend.models.user import User
from backend.routes.courses import _remove_files, _remove_vectors, course_counts
from backend.schemas.admin import ReasonRequest
from backend.schemas.course import CourseOwner
from backend.services.admin_account import get_admin_account
from backend.services.embeddings import delete_course_vectors
from backend.services.notifications import NotificationType

# Public courses, for moderation. Private ones are never listed here.
router = APIRouter(dependencies=[Depends(get_admin)])

PAGE_SIZE = 20


class AdminCourseOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    share_code: str
    owner: CourseOwner
    documents_count: int
    audio_count: int
    links_count: int
    # people who added it
    members_count: int
    created_at: datetime


class AdminCoursePage(BaseModel):
    items: list[AdminCourseOut]
    total: int


class AdminCourseFile(BaseModel):
    id: int
    file_name: str
    kind: str
    size_bytes: int


class AdminCourseLink(BaseModel):
    title: str
    url: str


class AdminCourseNote(BaseModel):
    title: Optional[str]
    kind: str
    # the text of a typed note; empty for a drawing
    content: str


class AdminCourseDetail(BaseModel):
    course: AdminCourseOut
    materials: list[AdminCourseFile]
    links: list[AdminCourseLink]
    notes: list[AdminCourseNote]


def _course_out(db: Session, course: Course, counts: dict) -> AdminCourseOut:
    documents, audio, links, _ = counts.get(course.id, (0, 0, 0, 0))
    members = db.query(func.count()).select_from(CourseMember).filter(CourseMember.course_id == course.id).scalar()
    return AdminCourseOut(
        id=course.id, title=course.title, description=course.description, share_code=course.share_code,
        owner=CourseOwner.model_validate(course.owner), documents_count=documents, audio_count=audio,
        links_count=links, members_count=members, created_at=course.created_at,
    )


def _public_course(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None or not course.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Public course not found")
    return course


@router.get("", response_model=AdminCoursePage)
def list_public_courses(
    q: str = Query("", max_length=100, description="Words in the title, the course ID, or the owner's username."),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Public courses, newest first."""
    query = db.query(Course).join(User, User.id == Course.user_id).filter(Course.is_public.is_(True))
    for word in q.strip().split():
        pattern = f"%{word}%"
        query = query.filter(or_(Course.title.ilike(pattern), Course.share_code.ilike(pattern), User.username.ilike(pattern)))
    total = query.count()
    courses = query.order_by(Course.created_at.desc(), Course.id.desc()).offset(offset).limit(PAGE_SIZE).all()
    counts = course_counts(db, [c.id for c in courses])
    return AdminCoursePage(items=[_course_out(db, c, counts) for c in courses], total=total)


@router.get("/{course_id}", response_model=AdminCourseDetail)
def get_public_course(course_id: int, db: Session = Depends(get_db)):
    """Its files, links and notes: everything someone who adds it can see."""
    course = _public_course(db, course_id)
    return AdminCourseDetail(
        course=_course_out(db, course, course_counts(db, [course.id])),
        materials=[AdminCourseFile(id=m.id, file_name=m.file_name, kind=m.kind, size_bytes=m.size_bytes)
                   for m in sorted(course.materials, key=lambda m: m.id)],
        links=[AdminCourseLink(title=link.title, url=link.url) for link in course.links],
        notes=[AdminCourseNote(title=n.title, kind=n.kind, content="" if n.kind == "drawing" else n.content)
               for n in sorted(course.notes, key=lambda n: n.id)],
    )


@router.get("/{course_id}/materials/{material_id}/file")
def get_public_course_file(course_id: int, material_id: int, db: Session = Depends(get_db)):
    course = _public_course(db, course_id)
    material = db.query(CourseMaterial).filter(CourseMaterial.id == material_id, CourseMaterial.course_id == course.id).first()
    if material is None or not os.path.isfile(material.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    media_type = material.mime_type or mimetypes.guess_type(material.file_path)[0] or "application/octet-stream"
    return FileResponse(material.file_path, media_type=media_type, filename=material.file_name, content_disposition_type="inline")


@router.post("/{course_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
def remove_public_course(course_id: int, data: ReasonRequest, db: Session = Depends(get_db)):
    """Deletes the course for its owner and everyone who added it, and tells the owner why."""
    course = _public_course(db, course_id)
    admin_account = get_admin_account(db)
    file_paths = [m.file_path for m in course.materials]

    db.add(AdminLog(action="remove_course", target_type="course", target_id=course.id, details=json.dumps({
        "reason": data.reason,
        "author": course.owner.username,
        "title": course.title,
        "share_code": course.share_code,
        "files": [m.file_name for m in course.materials],
    }, ensure_ascii=False)))
    db.add(Notification(
        user_id=course.user_id, actor_id=admin_account.id, type=NotificationType.course_removed.value,
        message=json.dumps({"title": course.title, "reason": data.reason, "ref": course.share_code}, ensure_ascii=False),
    ))
    # materials, notes, links, summaries, shares and members go with it (the ORM cascade)
    db.delete(course)
    db.commit()

    _remove_files(file_paths)
    _remove_vectors(delete_course_vectors, course_id)
