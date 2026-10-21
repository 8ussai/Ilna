from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# the four blogs: everyone, or the author's university, college or major
class PostScope(str, Enum):
    general = "general"
    university = "university"
    college = "college"
    major = "major"


# how a blog is ordered
class PostSort(str, Enum):
    hot = "hot"
    new = "new"
    top = "top"


# what every post has
class PostBase(BaseModel):
    content: str


# a new post (sent as form fields, with its pictures)
class PostCreate(PostBase):
    # university, college and major are pulled from the user's profile
    scope: PostScope
    # shown as "Anonymous N" to everyone but the author and the admin
    is_anonymous: bool = False

    # post text: not empty, up to 5000 characters
    @field_validator("content")
    @classmethod
    def check_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Post can't be empty.")
        if len(value) > 5000:
            raise ValueError("Post is too long (max 5000 characters).")
        return value


# who wrote a post or reply, as others see it
class PostAuthor(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    # shown with a gold name and a crown
    is_premium: bool = False
    # An anonymous author has blank id, names and username (see blog/anonymity.py):
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


# a post as the reader sees it
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


# what an activity entry is
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


# the author's one switch between anonymous and named
class AnonymitySwitch(BaseModel):
    # the one switch after posting: true hides the author's name, false shows it
    is_anonymous: bool


# an upvote or downvote; the same one again takes it back
class PostVoteAction(BaseModel):
    vote_dir: int = Field(..., description="1 for upvote, -1 for downvote")


# the reader's vote and the new score after voting
class PostVoteResult(BaseModel):
    message: str
    vote_dir: int
    votes_count: int


# a new reply, to the post or to another reply
class ReplyCreate(BaseModel):
    content: str
    # leave empty to reply to the post itself
    parent_id: Optional[int] = None
    # shown as "Anonymous N" to everyone but the author and the admin
    is_anonymous: bool = False

    # reply text: not empty, up to 5000 characters
    @field_validator("content")
    @classmethod
    def check_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Reply can't be empty.")
        if len(value) > 5000:
            raise ValueError("Reply is too long (max 5000 characters).")
        return value


# a reply as the reader sees it
class ReplyOut(BaseModel):
    id: int
    post_id: int
    parent_id: Optional[int]
    # null when the reply is deleted or anonymous
    user_id: Optional[int]
    # empty and author-less when is_deleted is true
    content: str
    is_deleted: bool
    # a placeholder the admin left, shown as "[removed by admin]"
    removed_by_admin: bool = False
    created_at: datetime
    votes_count: int
    my_vote: int
    author: Optional[PostAuthor]
    is_anonymous: bool = False
    # the reader wrote it; true for their anonymous replies too
    is_mine: bool = False
    # the author already used their one switch between anonymous and named
    anonymity_switched: bool = False


# why a post or reply is being reported
class ReportReason(str, Enum):
    spam = "spam"
    harassment = "harassment"
    inappropriate = "inappropriate"
    other = "other"


# a report on a post or reply
class ReportCreate(BaseModel):
    reason: ReportReason
    # optional detail for the admin; only the admin ever sees it
    note: Optional[str] = None

    # the optional note: up to 500 characters
    @field_validator("note")
    @classmethod
    def check_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if len(value) > 500:
            raise ValueError("Note is too long (max 500 characters).")
        return value or None
