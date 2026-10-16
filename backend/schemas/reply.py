from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from backend.schemas.post import PostAuthor


class ReplyCreate(BaseModel):
    content: str
    # leave empty to reply to the post itself
    parent_id: Optional[int] = None

    @field_validator("content")
    @classmethod
    def check_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Reply can't be empty.")
        if len(value) > 5000:
            raise ValueError("Reply is too long (max 5000 characters).")
        return value


class ReplyOut(BaseModel):
    id: int
    post_id: int
    parent_id: Optional[int]
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
