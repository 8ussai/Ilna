from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import literal, select, union_all
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.accounts.schemas import (
    AccentColorUpdate,
    DailyUsageOut,
    StorageOut,
    UsageOut,
    UserOut,
)
from backend.accounts.storage import storage_used
from backend.accounts.usage import course_limit, storage_limit, study_limit, study_usage
from backend.blog.models import Post, Reply
from backend.blog.schemas import ActivityItem
from backend.config import ACTIVITY_PREVIEW_CHARS
from backend.core.dependencies import get_current_user
from backend.database import get_db

router = APIRouter()


# how much storage the student uses, out of their limit
@router.get("/storage", response_model=StorageOut)
def get_storage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return StorageOut(used_bytes=storage_used(db, current_user.id), limit_bytes=storage_limit(current_user))


@router.get("/usage", response_model=UsageOut)
def get_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Storage, and how many summaries and quizzes are left today."""

    # summaries or quizzes of one kind started in the last 24 hours
    def daily(kind: str) -> DailyUsageOut:
        used, frees_at = study_usage(db, current_user.id, kind)
        return DailyUsageOut(used=used, limit=study_limit(current_user, kind), frees_at=frees_at)

    return UsageOut(
        premium=current_user.is_premium,
        storage=StorageOut(used_bytes=storage_used(db, current_user.id), limit_bytes=storage_limit(current_user)),
        summary=daily("summary"),
        quiz=daily("quiz"),
        course_limit=course_limit(current_user),
    )


@router.put("/accent-color", response_model=UserOut)
def set_accent_color(
    body: AccentColorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The site's theme color: a preset for everyone, or any color for premium."""
    if body.accent_color and body.accent_color.startswith("#") and not current_user.is_premium:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Custom colors are a Premium feature.")
    current_user.accent_color = body.accent_color
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/activity", response_model=list[ActivityItem])
def get_activity(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The user's posts and replies together, newest first. Deleted reply placeholders are left out."""
    posts = select(
        literal("post").label("type"),
        Post.id.label("id"),
        Post.id.label("post_id"),
        Post.scope.label("scope"),
        Post.content.label("content"),
        Post.created_at.label("created_at"),
        Post.is_anonymous.label("is_anonymous"),
    ).where(Post.user_id == current_user.id)

    replies = (
        select(
            literal("reply").label("type"),
            Reply.id.label("id"),
            Reply.post_id.label("post_id"),
            Post.scope.label("scope"),
            Reply.content.label("content"),
            Reply.created_at.label("created_at"),
            Reply.is_anonymous.label("is_anonymous"),
        )
        .join(Post, Post.id == Reply.post_id)
        .where(Reply.user_id == current_user.id, Reply.is_deleted.is_(False))
    )

    activity = union_all(posts, replies).subquery()
    rows = db.execute(
        select(activity)
        .order_by(activity.c.created_at.desc(), activity.c.type, activity.c.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return [
        ActivityItem(
            type=row.type,
            id=row.id,
            post_id=row.post_id,
            scope=row.scope,
            content=row.content[:ACTIVITY_PREVIEW_CHARS],
            created_at=row.created_at,
            is_anonymous=row.is_anonymous,
        )
        for row in rows
    ]
