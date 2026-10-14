from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict, model_validator
from datetime import datetime

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


class UserCreate(UserBase):
    password: str

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
        if len(self.new_password) < 8:
            raise ValueError("Password must be at least 8 characters.")
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
    storage: StorageOut
    summary: DailyUsageOut
    quiz: DailyUsageOut


class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
