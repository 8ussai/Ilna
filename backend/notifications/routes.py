import json

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.accounts.models import User
from backend.blog.anonymity import anon_numbers_for, anonymous_reply_author
from backend.config import NOTIFICATION_PREVIEW_CHARS
from backend.core.dependencies import get_current_user
from backend.database import get_db
from backend.notifications.models import Notification
from backend.notifications.schemas import MarkRead, NotificationOut, UnreadCount
from backend.notifications.service import NotificationType

router = APIRouter()


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

    # an anonymous reply's notice names its "Anonymous N", worked out now so a later switch shows here too
    anon_numbers = anon_numbers_for(
        db, ((n.reply.post_id, n.reply.user_id) for n in notifications if _from_anonymous_reply(n))
    )
    return [_map_notification(n, anon_numbers) for n in notifications]


# whether a reply notice is from an anonymous reply, whose author stays hidden
def _from_anonymous_reply(n: Notification) -> bool:
    replied = n.type in (NotificationType.post_reply.value, NotificationType.reply_reply.value)
    return replied and n.reply is not None and n.reply.is_anonymous and not n.reply.is_deleted


# a notification as the reader sees it
def _map_notification(n: Notification, anon_numbers: dict[tuple[int, int], int]) -> NotificationOut:
    actor = n.actor
    if _from_anonymous_reply(n):
        actor = anonymous_reply_author(
            n.reply.post, n.reply.user_id, anon_numbers.get((n.reply.post_id, n.reply.user_id))
        )
    out = NotificationOut(
        id=n.id,
        type=n.type,
        vote_dir=n.vote_dir,
        actor=actor,
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
    elif n.type == NotificationType.course_shared.value:
        data = json.loads(n.message or "{}")
        out.course_id = data.get("course_id")
        out.preview = data.get("title", "")
    elif n.type == NotificationType.course_removed.value:
        data = json.loads(n.message or "{}")
        out.preview = data.get("title", "")
        out.reason = data.get("reason")
        out.ref = data.get("ref")
    else:
        out.preview = (n.reply.content if n.reply else n.post.content)[:NOTIFICATION_PREVIEW_CHARS]
    return out


# how many notifications are unread, for the badge
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


# marks some or all of the user's notifications read
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
