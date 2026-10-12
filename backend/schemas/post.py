from enum import Enum
from pydantic import BaseModel
from datetime import datetime
from pydantic import Field, field_validator


class PostScope(str, Enum):
    general = "general"
    university = "university"
    college = "college"
    major = "major"


class PostBase(BaseModel):
    content: str


class PostCreate(PostBase):
    # university, college and major are pulled from the user's profile
    scope: PostScope

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

    model_config = {"from_attributes": True}


class PostOut(PostBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    votes_count: int

    scope: PostScope
    university: str
    college: str
    major: str

    author: PostAuthor

    model_config = {"from_attributes": True}


class PostVoteAction(BaseModel):
    vote_dir: int = Field(..., description="1 for upvote, -1 for downvote")
