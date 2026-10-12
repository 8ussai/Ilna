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


class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    last_username_change: datetime

    model_config = ConfigDict(from_attributes=True)
