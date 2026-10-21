import re
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, model_validator
from datetime import datetime

from backend.backendConfig import ACCENT_PRESETS, RESERVED_USERNAME_WORDS, TEST_USERNAME_PREFIX
from backend.core.security import check_password_strength
from backend.services.catalog import validate_selection, email_matches_domain


class UserBase(BaseModel):
    username: str
    first_name: str
    last_name: str
    email: EmailStr
    # ids from the catalog (backend/data/universities.json)
    country: str
    university: str
    college: str
    major: str


# same rule as USERNAME_RE in frontend/src/components/RegisterForm.tsx
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,30}$")
USERNAME_LETTER_RE = re.compile(r"[a-z]")


class UserCreate(UserBase):
    password: str

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        value = value.strip()
        if not USERNAME_RE.fullmatch(value):
            raise ValueError("Username must be 3-30 lowercase letters (a-z), numbers or underscores (_).")
        if not USERNAME_LETTER_RE.search(value):
            raise ValueError("Username must have at least one letter (a-z).")
        if value.startswith(TEST_USERNAME_PREFIX):
            raise ValueError("Usernames starting with \"testuser\" are kept for test accounts.")
        # anonymous posts show as "Anonymous N" and "Author", so nobody can be named like them
        for word in RESERVED_USERNAME_WORDS:
            if word in value:
                raise ValueError(f"Usernames containing \"{word}\" aren't allowed.")
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        check_password_strength(value)
        return value

    @model_validator(mode="after")
    def check_catalog_and_email(self):
        university = validate_selection(self.country, self.university, self.college, self.major)

        if not email_matches_domain(self.email, university["domain"]):
            raise ValueError(f"Please register with your university email (e.g. name@{university['domain']}).")

        return self


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @model_validator(mode="after")
    def check_new_password(self):
        check_password_strength(self.new_password)
        if self.new_password == self.current_password:
            raise ValueError("New password must be different from the current one.")
        return self


class StorageOut(BaseModel):
    used_bytes: int
    limit_bytes: int


class DailyUsageOut(BaseModel):
    # started in the last 24 hours, out of the limit
    used: int
    limit: int
    # when the oldest of those leaves the 24 hours, freeing one up; null when none were started
    frees_at: Optional[datetime]


class UsageOut(BaseModel):
    # premium is shown as unlimited summaries and quizzes; the limits here are its hidden cap
    premium: bool
    storage: StorageOut
    summary: DailyUsageOut
    quiz: DailyUsageOut
    # null for premium, which has no limit
    course_limit: Optional[int]


HEX_COLOR_RE = re.compile(r"^#[0-9a-f]{6}$")


class AccentColorUpdate(BaseModel):
    # a preset name, a "#rrggbb" (premium only, checked by the route), or null for the default
    accent_color: Optional[str]

    @field_validator("accent_color")
    @classmethod
    def check_accent_color(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().lower()
        if value not in ACCENT_PRESETS and not HEX_COLOR_RE.fullmatch(value):
            raise ValueError("Unknown theme color.")
        return value


class UserOut(UserBase):
    id: int
    is_premium: bool = False
    accent_color: Optional[str] = None
    # made by the admin; its email is a stand-in that's never shown or emailed
    is_test: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OtpVerify(BaseModel):
    email: EmailStr
    code: str


class OtpResend(BaseModel):
    email: EmailStr


# "Forgot password?": the email or username typed on the login form
class PasswordResetRequest(BaseModel):
    identifier: str


class PasswordReset(BaseModel):
    identifier: str
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_new_password(cls, value: str) -> str:
        check_password_strength(value)
        return value
