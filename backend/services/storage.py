from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.course import Course, CourseMaterial
from backend.models.post import PostImage
from backend.models.user import User
from backend.services.course_sharing import member_courses


def course_bytes(db: Session, course_ids: list[int]) -> int:
    """Total size of the files in these courses."""
    if not course_ids:
        return 0
    return (
        db.query(func.coalesce(func.sum(CourseMaterial.size_bytes), 0))
        .filter(CourseMaterial.course_id.in_(course_ids))
        .scalar()
    )


def storage_used(db: Session, user_id: int) -> int:
    """Total bytes the user's storage holds: their course files, the pictures in their posts, and the files
    of courses they added from others (an added course counts for everyone who has it)."""
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
    user = db.get(User, user_id)
    added = course_bytes(db, [course.id for course, _ in member_courses(db, user)]) if user else 0
    return course_files + post_images + added
