from enum import Enum
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from pydantic import Field, field_validator


class PostScope(str, Enum):
    general = "general"
    university = "university"
    college = "college"
    major = "major"


class PostSort(str, Enum):
    hot = "hot"
    new = "new"
    top = "top"


class PostBase(BaseModel):
    content: str


class PostCreate(PostBase):
    # university, college and major are pulled from the user's profile
    scope: PostScope
    # shown as "Anonymous N" to everyone but the author and the admin
    is_anonymous: bool = False

    @field_validator("content")
    @classmethod
    def check_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Post can't be empty.")
        if len(value) > 5000:
            raise ValueError("Post is too long (max 5000 characters).")
        return value


class PostAuthor(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    # shown with a gold name and a crown
    is_premium: bool = False
    # An anonymous author has blank id, names and username (see services/anonymity.py):
    # anon_number is their number in the thread ("Anonymous 2"), and is_thread_author marks the
    # anonymous post's own author replying in its thread ("Author"). Neither: the anonymous post itself.
    anon_number: Optional[int] = None
    is_thread_author: bool = False

    model_config = {"from_attributes": True}


class PostImageOut(BaseModel):
    """Fetched from /posts/{post_id}/images/{id}; the size lets the page keep the space while it loads."""
    id: int
    width: int
    height: int
    is_animated: bool

    model_config = {"from_attributes": True}


class PostOut(PostBase):
    id: int
    # null when the post is anonymous
    user_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    votes_count: int
    # the current user's vote: 1, -1, or 0 for none
    my_vote: int = 0
    # replies that aren't deleted, across the whole thread
    replies_count: int = 0

    scope: PostScope
    university: str
    college: str
    major: str

    author: PostAuthor
    # written by the admin (author is "Ilna Admin"); can't be reported
    is_admin_post: bool = False
    # pinned to the top of its blog right now
    is_pinned: bool = False
    is_anonymous: bool = False
    # the reader wrote it; true for their anonymous posts too
    is_mine: bool = False
    # the author already used their one switch between anonymous and named
    anonymity_switched: bool = False
    images: list[PostImageOut] = []

    model_config = {"from_attributes": True}


class ActivityType(str, Enum):
    post = "post"
    reply = "reply"


class ActivityItem(BaseModel):
    """One of the user's own posts or replies, for their activity history."""
    type: ActivityType
    # the post's or the reply's id, depending on type
    id: int
    # the post to open (the post itself, or the one the reply is on)
    post_id: int
    # the blog the post is in
    scope: PostScope
    # cut to ACTIVITY_PREVIEW_CHARS; the full text is on the post page
    content: str
    created_at: datetime
    is_anonymous: bool = False


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
    # removal notices: the admin's reason and the #P42 / #R17 that was removed
    reason: Optional[str] = None
    ref: Optional[str] = None
    is_read: bool
    created_at: datetime


class AnonymitySwitch(BaseModel):
    # the one switch after posting: true hides the author's name, false shows it
    is_anonymous: bool


class UnreadCount(BaseModel):
    count: int


class MarkRead(BaseModel):
    # leave empty to mark all of the user's notifications read
    ids: Optional[list[int]] = None


class PostVoteAction(BaseModel):
    vote_dir: int = Field(..., description="1 for upvote, -1 for downvote")


class PostVoteResult(BaseModel):
    message: str
    vote_dir: int
    votes_count: int
