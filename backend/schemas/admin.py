from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

from backend.schemas.post import PostAuthor, PostScope


class AdminCodeRequest(BaseModel):
    email: str


class AdminCodeVerify(BaseModel):
    email: str
    code: str


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class AdminSession(BaseModel):
    email: str


class ReasonRequest(BaseModel):
    """A ban or a removal; the student is told the reason."""
    reason: str

    @field_validator("reason")
    @classmethod
    def check_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give a reason; the student is told it.")
        if len(value) > 500:
            raise ValueError("Reason is too long (max 500 characters).")
        return value


BanRequest = ReasonRequest


class AdminUserOut(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    email: str
    is_verified: bool
    is_banned: bool
    banned_reason: Optional[str]
    banned_at: Optional[datetime]
    created_at: datetime
    # catalog ids; the panel shows their names
    country: str
    university: str
    college: str
    major: str
    posts_count: int = 0
    # replies that aren't deleted
    replies_count: int = 0
    courses_count: int = 0
    storage_bytes: int = 0

    model_config = {"from_attributes": True}


class AdminUserPage(BaseModel):
    items: list[AdminUserOut]
    # every match, not just this page
    total: int


class DeleteUserRequest(BaseModel):
    # the admin types the username to confirm, so a slip of the mouse can't delete an account
    confirm_username: str


class AdminPostOut(BaseModel):
    id: int
    content: str
    scope: PostScope
    university: str
    college: str
    major: str
    created_at: datetime
    author: PostAuthor
    # an admin post (step 8); the author is the hidden admin account
    is_admin_post: bool
    pinned_until: Optional[datetime]
    # pinned_until is still ahead
    is_pinned: bool
    votes_count: int
    # replies that aren't deleted
    replies_count: int


class AdminPostPage(BaseModel):
    items: list[AdminPostOut]
    total: int


class AdminReplyOut(BaseModel):
    id: int
    parent_id: Optional[int]
    # empty and author-less for placeholders
    content: str
    is_deleted: bool
    removed_by_admin: bool
    author: Optional[PostAuthor]
    created_at: datetime
    votes_count: int


class AdminPostDetail(BaseModel):
    post: AdminPostOut
    # the whole thread, flat and oldest first; parent_id builds the tree
    replies: list[AdminReplyOut]


class ReplyLookup(BaseModel):
    reply_id: int
    post_id: int


class AdminReportEntry(BaseModel):
    reason: str
    note: Optional[str]
    # shown to the admin only, never to the author
    reporter: PostAuthor
    created_at: datetime


class AdminReportGroup(BaseModel):
    """Every open report on one post or reply."""
    target_type: Literal["post", "reply"]
    target_id: int
    # the post itself, or the one the reply is on
    post_id: int
    content: str
    author: PostAuthor
    # the post's blog and where its author was
    scope: PostScope
    university: str
    college: str
    major: str
    created_at: datetime
    reports_count: int
    latest_at: datetime
    reports: list[AdminReportEntry]


class ReportTarget(BaseModel):
    target_type: Literal["post", "reply"]
    target_id: int


class OpenCount(BaseModel):
    count: int


class MessageAudience(BaseModel):
    """Who an admin message goes to: one user, everyone, or a university, college or major (catalog id in value)."""
    target: Literal["user", "everyone", "university", "college", "major"]
    user_id: Optional[int] = None
    value: Optional[str] = None


class AdminMessageCreate(MessageAudience):
    message: str
    # the count the admin was shown; if the audience changed since, nothing is sent
    confirm_count: int

    @field_validator("message")
    @classmethod
    def check_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Write a message.")
        if len(value) > 2000:
            raise ValueError("Message is too long (max 2000 characters).")
        return value


class RecipientCount(BaseModel):
    count: int


# matches the pin-hours field in the panel
MAX_PIN_HOURS = 168


def _check_pin_hours(value: Optional[int]) -> Optional[int]:
    if value is not None and not 1 <= value <= MAX_PIN_HOURS:
        raise ValueError(f"Pin for 1 to {MAX_PIN_HOURS} hours.")
    return value


class AdminPostCreate(BaseModel):
    scope: PostScope
    # the university, college or major id for a scoped blog; empty for general
    value: Optional[str] = None
    content: str
    # pinned to the top for this many hours; null for not pinned
    pin_hours: Optional[int] = None

    @field_validator("content")
    @classmethod
    def check_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Post can't be empty.")
        if len(value) > 5000:
            raise ValueError("Post is too long (max 5000 characters).")
        return value

    @field_validator("pin_hours")
    @classmethod
    def check_pin_hours(cls, value: Optional[int]) -> Optional[int]:
        return _check_pin_hours(value)


class PinRequest(BaseModel):
    # null unpins
    pin_hours: Optional[int] = None

    @field_validator("pin_hours")
    @classmethod
    def check_pin_hours(cls, value: Optional[int]) -> Optional[int]:
        return _check_pin_hours(value)
