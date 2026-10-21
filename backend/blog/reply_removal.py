from sqlalchemy.orm import Session

from backend.blog.models import Reply


def remove_reply(db: Session, reply: Reply, *, by_admin: bool = False, placeholder_owner_id: int | None = None) -> None:
    """A reply that has answers stays as a placeholder so the thread holds together ("[deleted]", or
    "[removed by admin]" with by_admin); anything else goes, along with placeholders left empty above it.
    placeholder_owner_id moves a kept placeholder to another account (when its owner is being deleted).
    Flushes, doesn't commit."""
    if reply.children:
        reply.is_deleted = True
        reply.removed_by_admin = by_admin
        reply.content = ""
        reply.votes.clear()
        # what it said is gone, so are the notifications pointing at it
        reply.notifications.clear()
        if placeholder_owner_id is not None:
            reply.user_id = placeholder_owner_id
        db.flush()
        return

    parent = reply.parent
    db.delete(reply)
    db.flush()
    while parent is not None and parent.is_deleted:
        db.refresh(parent)
        if parent.children:
            break
        grandparent = parent.parent
        db.delete(parent)
        db.flush()
        parent = grandparent
