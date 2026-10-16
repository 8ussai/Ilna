from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


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


class BanRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def check_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give a reason; it goes in the email to the student.")
        if len(value) > 500:
            raise ValueError("Reason is too long (max 500 characters).")
        return value


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
