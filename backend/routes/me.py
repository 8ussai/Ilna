from fastapi import APIRouter, Depends, Query
from sqlalchemy import literal, select, union_all
from sqlalchemy.orm import Session

from backend.backendConfig import STORAGE_LIMIT_BYTES
from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.post import Post, Reply
from backend.models.user import User
from backend.schemas.post import ActivityItem
from backend.schemas.user import StorageOut
from backend.services.storage import storage_used

router = APIRouter()

ACTIVITY_PREVIEW_CHARS = 300


@router.get("/storage", response_model=StorageOut)
def get_storage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return StorageOut(used_bytes=storage_used(db, current_user.id), limit_bytes=STORAGE_LIMIT_BYTES)


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
    ).where(Post.user_id == current_user.id)

    replies = (
        select(
            literal("reply").label("type"),
            Reply.id.label("id"),
            Reply.post_id.label("post_id"),
            Post.scope.label("scope"),
            Reply.content.label("content"),
            Reply.created_at.label("created_at"),
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
        )
        for row in rows
    ]
