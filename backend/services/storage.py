from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.course import Course, CourseMaterial


def storage_used(db: Session, user_id: int) -> int:
    """Total bytes of every file the user has uploaded, across all their courses."""
    return (
        db.query(func.coalesce(func.sum(CourseMaterial.size_bytes), 0))
        .join(Course, Course.id == CourseMaterial.course_id)
        .filter(Course.user_id == user_id)
        .scalar()
    )
