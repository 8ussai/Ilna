from enum import Enum
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from datetime import datetime

from backend.backendConfig import UNIVERSITY_EMAIL_DOMAINS_ALLOWLIST


class Country(str, Enum):
    jordan = "Jordan"
    saudi_arabia = "Saudi Arabia"


def is_university_email(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()

    # allowlisted domain or one of its subdomains (e.g. std.example.com)
    for allowed in UNIVERSITY_EMAIL_DOMAINS_ALLOWLIST:
        if domain == allowed or domain.endswith("." + allowed):
            return True

    labels = domain.split(".")
    if len(labels) < 2:
        return False

    # *.edu (e.g. mit.edu)
    if labels[-1] == "edu":
        return True

    # *.edu.xx / *.ac.xx (e.g. ju.edu.jo, ksu.edu.sa, ox.ac.uk)
    if len(labels) >= 3 and labels[-2] in ("edu", "ac") and len(labels[-1]) == 2:
        return True

    return False


class UserBase(BaseModel):
    username: str
    first_name: str
    last_name: str
    email: EmailStr
    country: Country
    university: str
    college: str
    major: str


class UserCreate(UserBase):
    password: str

    @field_validator("email")
    @classmethod
    def email_must_be_university(cls, email: str) -> str:
        if not is_university_email(email):
            raise ValueError("Please register with your university email (e.g. name@ju.edu.jo).")
        return email


class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    last_username_change: datetime

    model_config = ConfigDict(from_attributes=True)
