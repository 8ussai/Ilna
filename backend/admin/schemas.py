from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator, model_validator

from backend.blog.schemas import PostAuthor, PostImageOut, PostScope
from backend.config import MAX_PIN_HOURS
from backend.core.catalog import validate_selection
from backend.courses.schemas import CourseOwner


# asks for an admin login code by email
class AdminCodeRequest(BaseModel):
    email: str


# the emailed code, to log in as the admin
class AdminCodeVerify(BaseModel):
    email: str
    code: str


# an admin login and when it ends
class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


# the admin login the panel is using
class AdminSession(BaseModel):
    email: str


class ReasonRequest(BaseModel):
    """A ban or a removal; the student is told the reason."""

    reason: str

    # the reason is required and up to 500 characters
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


# a student as the admin's Users page shows them, with their totals
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
    is_premium: bool
    premium_since: Optional[datetime]
    # test accounts: email is a stand-in, and the admin can turn them off
    is_test: bool
    is_active: bool
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


# one page of the Users list
class AdminUserPage(BaseModel):
    items: list[AdminUserOut]
    # every match, not just this page
    total: int


# deleting a student's account for good
class DeleteUserRequest(BaseModel):
    # the admin types the username to confirm, so a slip of the mouse can't delete an account
    confirm_username: str


# a post as the admin's Posts page shows it (the real author included)
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
    # posted anonymously: what everyone else sees in place of the author; the admin sees both
    shown_as: Optional[PostAuthor] = None
    # fetched from /admin/posts/{id}/images/{image id}
    images: list[PostImageOut] = []


# one page of the Posts list
class AdminPostPage(BaseModel):
    items: list[AdminPostOut]
    total: int


# a reply as the admin sees it in a thread
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
    # posted anonymously: what everyone else sees in place of the author
    shown_as: Optional[PostAuthor] = None


# a post with its whole thread, for the admin
class AdminPostDetail(BaseModel):
    post: AdminPostOut
    # the whole thread, flat and oldest first; parent_id builds the tree
    replies: list[AdminReplyOut]


# which post a reply is on, for jumping to #R17
class ReplyLookup(BaseModel):
    reply_id: int
    post_id: int


# one report on a post or reply
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
    # the post or reply is anonymous: what everyone else sees in place of the author
    shown_as: Optional[PostAuthor] = None
    # a reported post's pictures; empty for a reply
    images: list[PostImageOut] = []


# the post or reply whose reports are dismissed
class ReportTarget(BaseModel):
    target_type: Literal["post", "reply"]
    target_id: int


# how many things are waiting, for a tab's badge
class OpenCount(BaseModel):
    count: int


class MessageAudience(BaseModel):
    """Who an admin message goes to: one user, everyone, or a university, college or major (catalog id in value)."""

    target: Literal["user", "everyone", "university", "college", "major"]
    user_id: Optional[int] = None
    value: Optional[str] = None


# a message to students, sent as notifications from Ilna Admin
class AdminMessageCreate(MessageAudience):
    message: str
    # the count the admin was shown; if the audience changed since, nothing is sent
    confirm_count: int

    # the message is required and up to 2000 characters
    @field_validator("message")
    @classmethod
    def check_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Write a message.")
        if len(value) > 2000:
            raise ValueError("Message is too long (max 2000 characters).")
        return value


# how many students a message reaches
class RecipientCount(BaseModel):
    count: int


# pins last 1 to MAX_PIN_HOURS hours; null means not pinned
def _check_pin_hours(value: Optional[int]) -> Optional[int]:
    if value is not None and not 1 <= value <= MAX_PIN_HOURS:
        raise ValueError(f"Pin for 1 to {MAX_PIN_HOURS} hours.")
    return value


# a post from Ilna Admin in any blog
class AdminPostCreate(BaseModel):
    scope: PostScope
    # the university, college or major id for a scoped blog; empty for general
    value: Optional[str] = None
    content: str
    # pinned to the top for this many hours; null for not pinned
    pin_hours: Optional[int] = None

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

    # pin for 1 to MAX_PIN_HOURS hours, or not at all
    @field_validator("pin_hours")
    @classmethod
    def check_pin_hours(cls, value: Optional[int]) -> Optional[int]:
        return _check_pin_hours(value)


# pins or unpins one of the admin's posts
class PinRequest(BaseModel):
    # null unpins
    pin_hours: Optional[int] = None

    # pin for 1 to MAX_PIN_HOURS hours, or null to unpin
    @field_validator("pin_hours")
    @classmethod
    def check_pin_hours(cls, value: Optional[int]) -> Optional[int]:
        return _check_pin_hours(value)


# who sent a Contact us message
class ContactSender(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    email: str
    university: str
    college: str
    major: str

    model_config = {"from_attributes": True}


# one Contact us message
class AdminContactOut(BaseModel):
    id: int
    subject: str
    message: str
    created_at: datetime
    handled_at: Optional[datetime]
    sender: ContactSender

    model_config = {"from_attributes": True}


# one page of the contact inbox
class AdminContactPage(BaseModel):
    items: list[AdminContactOut]
    total: int


# marks a contact message handled or open again
class HandledRequest(BaseModel):
    handled: bool


# one entry of the admin log
class AdminLogOut(BaseModel):
    id: int
    action: str
    target_type: Optional[str]
    target_id: Optional[int]
    # parsed from the stored JSON: reasons, removed text, recipients, ...
    details: dict
    created_at: datetime


# one page of the admin log
class AdminLogPage(BaseModel):
    items: list[AdminLogOut]
    total: int
    # every action that appears in the log, for the filter
    actions: list[str]


# a new test account
class TestUserCreate(BaseModel):
    first_name: str
    last_name: str
    # catalog ids, as at sign-up
    country: str
    university: str
    college: str
    major: str

    # names: 1 to 50 characters
    @field_validator("first_name", "last_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 50:
            raise ValueError("Names must be 1-50 characters.")
        return value

    # the university, college and major must be in the catalog
    @model_validator(mode="after")
    def check_catalog(self):
        validate_selection(self.country, self.university, self.college, self.major)
        return self


# a test account's password, shown to the admin
class TestPassword(BaseModel):
    password: str


# a new test account with its password
class TestUserCreated(BaseModel):
    user: AdminUserOut
    password: str


# a public course as the admin's Courses page lists it
class AdminCourseOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    share_code: str
    owner: CourseOwner
    documents_count: int
    audio_count: int
    links_count: int
    # people who added it
    members_count: int
    created_at: datetime


# one page of public courses
class AdminCoursePage(BaseModel):
    items: list[AdminCourseOut]
    total: int


# a file in a public course
class AdminCourseFile(BaseModel):
    id: int
    file_name: str
    kind: str
    size_bytes: int


# a link in a public course
class AdminCourseLink(BaseModel):
    title: str
    url: str


# a note in a public course
class AdminCourseNote(BaseModel):
    title: Optional[str]
    kind: str
    # the text of a typed note; empty for a drawing
    content: str


# everything in a public course, for the admin
class AdminCourseDetail(BaseModel):
    course: AdminCourseOut
    materials: list[AdminCourseFile]
    links: list[AdminCourseLink]
    notes: list[AdminCourseNote]
