import json
from enum import Enum
from typing import Optional

from sqlalchemy.orm import Session

from backend.models.notification import Notification
from backend.models.post import Post, Reply
from backend.models.user import User


class NotificationType(str, Enum):
    post_vote = "post_vote"
    reply_vote = "reply_vote"
    post_reply = "post_reply"
    reply_reply = "reply_reply"
    # from the admin; the text lives in Notification.message
    post_removed = "post_removed"
    reply_removed = "reply_removed"
    admin_message = "admin_message"


# the start of removed text kept in a removal notice, so the author knows which one it was
REMOVED_PREVIEW_CHARS = 200


def notify_removal(
    db: Session,
    *,
    recipient_id: int,
    admin_account_id: int,
    type: NotificationType,
    ref: str,
    reason: str,
    content: str,
    post_id: Optional[int] = None,
) -> None:
    """Tell an author the admin removed their post or reply. The notice has no post link (the post may be gone),
    so what it needs is kept in message: the #P/#R ref, the reason, a preview and, for a reply, its post. Doesn't commit."""
    if recipient_id == admin_account_id:
        return
    db.add(Notification(
        user_id=recipient_id,
        actor_id=admin_account_id,
        type=type.value,
        message=json.dumps({
            "ref": ref,
            "reason": reason,
            "preview": content[:REMOVED_PREVIEW_CHARS],
            "post_id": post_id,
        }, ensure_ascii=False),
    ))


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
    # nobody reads the hidden admin account's notifications
    owner = db.get(User, owner_id)
    if owner is None or owner.is_system:
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
    # nobody reads the hidden admin account's notifications
    if post.author.is_system:
        notified.add(post.user_id)

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
