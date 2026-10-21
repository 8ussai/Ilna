from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from backend.blog.schemas import PostAuthor


# one notification as the reader sees it
class NotificationOut(BaseModel):
    id: int
    # post_vote, reply_vote, post_reply, reply_reply, post_removed, reply_removed, admin_message or premium_granted
    type: str
    # 1 or -1 for votes, null for replies
    vote_dir: Optional[int]
    actor: PostAuthor
    # the hidden admin account, shown as "Ilna Admin" with a badge
    actor_is_admin: bool = False
    # the post to open; null when there's nothing to open (e.g. a removed post)
    post_id: Optional[int]
    # the reply to open and highlight, if any
    reply_id: Optional[int]
    # the start of the reply (or of the post for post votes), cut to NOTIFICATION_PREVIEW_CHARS;
    # for removal notices, the start of what was removed
    preview: str
    # removal notices: the admin's reason and the #P42 / #R17 (or course ID) that was removed
    reason: Optional[str] = None
    ref: Optional[str] = None
    # course_shared: the course to open (it may be gone by now)
    course_id: Optional[int] = None
    is_read: bool
    created_at: datetime


# how many notifications are unread
class UnreadCount(BaseModel):
    count: int


# which notifications to mark read
class MarkRead(BaseModel):
    # leave empty to mark all of the user's notifications read
    ids: Optional[list[int]] = None
