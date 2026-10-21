from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from backend.schemas.course import CourseColor, CourseOwner
from backend.services.course_sharing import ShareTarget


class CoursePreview(BaseModel):
    """What someone sees before adding a course (by its ID, or under "Shared with you")."""
    id: int
    title: str
    description: Optional[str] = None
    color: Optional[CourseColor] = None
    owner: CourseOwner
    is_public: bool
    documents_count: int
    audio_count: int
    links_count: int
    # already in the viewer's courses (theirs, or added)
    is_owner: bool = False
    is_member: bool = False
    created_at: datetime


class ShareCreate(BaseModel):
    target_type: ShareTarget
    # only for target_type "user"
    user_id: Optional[int] = None


class CourseShareOut(BaseModel):
    id: int
    target_type: ShareTarget
    # the person, for a "user" share
    user: Optional[CourseOwner] = None


class SharingOut(BaseModel):
    """The owner's sharing settings."""
    share_code: str
    is_public: bool
    shares: list[CourseShareOut]
    # people who added it and can still open it
    members_count: int


class SharingUpdate(BaseModel):
    is_public: bool


class AccessLoss(BaseModel):
    # how many members a change would remove, shown before the owner confirms
    members_losing: int
