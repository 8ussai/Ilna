from enum import Enum
from typing import Optional

from sqlalchemy.orm import Session

from backend.models.notification import Notification
from backend.models.post import Post, Reply


class NotificationType(str, Enum):
    post_vote = "post_vote"
    reply_vote = "reply_vote"
    post_reply = "post_reply"
    reply_reply = "reply_reply"


def sync_vote_notification(
    db: Session,
    *,
    owner_id: int,
    actor_id: int,
    type: NotificationType,
    post_id: int,
    reply_id: Optional[int],
    vote_dir: int,
) -> None:
    """Keep one notification per vote: added with the vote, updated when it flips, removed with it.
    Removing it on un-vote means toggling a vote again and again can't flood the owner. Doesn't commit."""
    if owner_id == actor_id:
        return

    existing = (
        db.query(Notification)
        .filter(
            Notification.user_id == owner_id,
            Notification.actor_id == actor_id,
            Notification.type == type.value,
            Notification.post_id == post_id,
            Notification.reply_id.is_(None) if reply_id is None else Notification.reply_id == reply_id,
        )
        .first()
    )

    if vote_dir == 0:
        if existing:
            db.delete(existing)
    elif existing:
        existing.vote_dir = vote_dir
    else:
        db.add(Notification(
            user_id=owner_id, actor_id=actor_id, type=type.value,
            post_id=post_id, reply_id=reply_id, vote_dir=vote_dir,
        ))


def notify_new_reply(db: Session, reply: Reply, post: Post, parent: Optional[Reply]) -> None:
    """Tell the parent reply's author someone answered them, and the post's author their post got a reply.
    Each person is told once, and never about their own reply. Call after flushing so reply.id is set."""
    notified = {reply.user_id}

    if parent is not None and parent.user_id not in notified:
        db.add(Notification(
            user_id=parent.user_id, actor_id=reply.user_id, type=NotificationType.reply_reply.value,
            post_id=post.id, reply_id=reply.id,
        ))
        notified.add(parent.user_id)

    if post.user_id not in notified:
        db.add(Notification(
            user_id=post.user_id, actor_id=reply.user_id, type=NotificationType.post_reply.value,
            post_id=post.id, reply_id=reply.id,
        ))
