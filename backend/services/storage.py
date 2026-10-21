from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.course import Course, CourseMaterial
from backend.models.post import PostImage


def storage_used(db: Session, user_id: int) -> int:
    """Total bytes of every file the user has uploaded: course files and pictures in posts."""
    course_files = (
        db.query(func.coalesce(func.sum(CourseMaterial.size_bytes), 0))
        .join(Course, Course.id == CourseMaterial.course_id)
        .filter(Course.user_id == user_id)
        .scalar()
    )
    post_images = (
        db.query(func.coalesce(func.sum(PostImage.size_bytes), 0))
        .filter(PostImage.user_id == user_id)
        .scalar()
    )
    return course_files + post_images
