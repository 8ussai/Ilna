from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.config import (
    COURSE_LIMIT,
    FRIEND_LIMIT,
    PREMIUM_FRIEND_LIMIT,
    PREMIUM_STORAGE_LIMIT_BYTES,
    PREMIUM_STUDY_DAILY_LIMITS,
    STORAGE_LIMIT_BYTES,
    STUDY_DAILY_LIMITS,
    STUDY_LIMIT_WINDOW,
)
from backend.database import utc_now
from backend.study.models import StudyGeneration


def study_usage(db: Session, user_id: int, kind: str) -> tuple[int, datetime | None]:
    """How many of this kind the user started in the window, and when the oldest of them leaves it (in UTC)."""
    # created_at is stored in UTC without an offset, so compare against a naive UTC time
    window_start = utc_now() - STUDY_LIMIT_WINDOW
    used, oldest = (
        db.query(func.count(StudyGeneration.id), func.min(StudyGeneration.created_at))
        .filter(
            StudyGeneration.user_id == user_id,
            StudyGeneration.kind == kind,
            StudyGeneration.created_at > window_start,
        )
        .one()
    )
    frees_at = oldest.replace(tzinfo=timezone.utc) + STUDY_LIMIT_WINDOW if oldest else None
    return used, frees_at


# summaries or quizzes of one kind a user can start in 24 hours
def study_limit(user: User, kind: str) -> int:
    return (PREMIUM_STUDY_DAILY_LIMITS if user.is_premium else STUDY_DAILY_LIMITS)[kind]


# how many bytes a user can store
def storage_limit(user: User) -> int:
    return PREMIUM_STORAGE_LIMIT_BYTES if user.is_premium else STORAGE_LIMIT_BYTES


# how many friends a user can have
def friend_limit(user: User) -> int:
    return PREMIUM_FRIEND_LIMIT if user.is_premium else FRIEND_LIMIT


def course_limit(user: User) -> int | None:
    """How many courses the user can have; None when there's no limit."""
    return None if user.is_premium else COURSE_LIMIT
