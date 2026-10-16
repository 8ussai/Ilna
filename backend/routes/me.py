import json

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, literal, select, union_all
from sqlalchemy.orm import Session, joinedload

from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.notification import Notification
from backend.models.post import Post, Reply
from backend.models.user import User
from backend.schemas.post import ActivityItem, MarkRead, NotificationOut, UnreadCount
from backend.schemas.user import DailyUsageOut, StorageOut, UsageOut
from backend.services.notifications import NotificationType
from backend.services.storage import storage_used
from backend.services.usage import storage_limit, study_limit, study_usage

router = APIRouter()

ACTIVITY_PREVIEW_CHARS = 300
NOTIFICATION_PREVIEW_CHARS = 200


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
    def daily(kind: str) -> DailyUsageOut:
        used, frees_at = study_usage(db, current_user.id, kind)
        return DailyUsageOut(used=used, limit=study_limit(current_user, kind), frees_at=frees_at)

    return UsageOut(
        premium=current_user.is_premium,
        storage=StorageOut(used_bytes=storage_used(db, current_user.id), limit_bytes=storage_limit(current_user)),
        summary=daily("summary"),
        quiz=daily("quiz"),
    )


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


@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The user's notification history, newest first."""
    notifications = (
        db.query(Notification)
        .options(joinedload(Notification.actor), joinedload(Notification.post), joinedload(Notification.reply))
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [_map_notification(n) for n in notifications]


def _map_notification(n: Notification) -> NotificationOut:
    out = NotificationOut(
        id=n.id,
        type=n.type,
        vote_dir=n.vote_dir,
        actor=n.actor,
        actor_is_admin=n.actor.is_system,
        post_id=n.post_id,
        reply_id=n.reply_id,
        preview="",
        is_read=n.is_read,
        created_at=n.created_at,
    )
    if n.type in (NotificationType.post_removed.value, NotificationType.reply_removed.value):
        # what was removed is gone, so the notice carries its own text (see notify_removal)
        data = json.loads(n.message or "{}")
        out.post_id = data.get("post_id")
        out.preview = data.get("preview", "")
        out.reason = data.get("reason")
        out.ref = data.get("ref")
    elif n.type == NotificationType.admin_message.value:
        # shown in full; the notifications page folds long ones
        out.preview = n.message or ""
    elif n.type == NotificationType.premium_granted.value:
        pass  # the app writes the whole notice in the reader's language
    else:
        out.preview = (n.reply.content if n.reply else n.post.content)[:NOTIFICATION_PREVIEW_CHARS]
    return out


@router.get("/notifications/unread-count", response_model=UnreadCount)
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .scalar()
    )
    return UnreadCount(count=count)


@router.post("/notifications/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notifications_read(
    body: MarkRead,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
    if body.ids is not None:
        query = query.filter(Notification.id.in_(body.ids))
    query.update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
