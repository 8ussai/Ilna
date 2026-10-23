from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from backend.courses.schemas import CourseColor, CourseOwner
from backend.courses.sharing import ShareTarget


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


# one share, as the owner's Share dialog lists it
class CourseShareOut(BaseModel):
    id: int
    target_type: ShareTarget
    # the person, for a "user" share
    user: Optional[CourseOwner] = None


class SharingOut(BaseModel):
    """The owner's sharing settings."""

    share_code: str
    is_public: bool
    notes_downloadable: bool
    shares: list[CourseShareOut]
    # people who added it and can still open it
    members_count: int


class SharingApply(BaseModel):
    """Everything the Share dialog sets, saved at once by its Share button."""

    is_public: bool
    notes_downloadable: bool
    # university, college, major and friends; people go in user_ids
    groups: list[ShareTarget] = Field(default_factory=list, max_length=4)
    user_ids: list[int] = Field(default_factory=list, max_length=200)

    @field_validator("groups")
    @classmethod
    def check_groups(cls, groups: list[ShareTarget]) -> list[ShareTarget]:
        if ShareTarget.user in groups:
            raise ValueError("People go in user_ids.")
        return groups


# the warning shown before a change that removes people's access
class AccessLoss(BaseModel):
    # how many members a change would remove, shown before the owner confirms
    members_losing: int
