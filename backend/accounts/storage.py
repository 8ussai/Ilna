from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.courses.models import Course, CourseMaterial


def storage_used(db: Session, user_id: int) -> int:
    """Total bytes the user's storage holds: only the files in their own courses. Courses added from others
    and post pictures don't count."""
    return (
        db.query(func.coalesce(func.sum(CourseMaterial.size_bytes), 0))
        .join(Course, Course.id == CourseMaterial.course_id)
        .filter(Course.user_id == user_id)
        .scalar()
    )
