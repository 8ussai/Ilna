from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, List
from urllib.parse import urlparse


def _clean_title(value: str, max_length: int) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Title can't be empty.")
    if len(value) > max_length:
        raise ValueError(f"Title is too long (max {max_length} characters).")
    return value


def _clean_description(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if len(value) > 500:
        raise ValueError("Description is too long (max 500 characters).")
    # an emptied description is stored as no description
    return value or None


def _clean_url(value: str) -> str:
    value = value.strip()
    parsed = urlparse(value)
    # only web links, so a saved link can never run javascript: or open a local file when clicked
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Link must be a full web address starting with http:// or https://.")
    if len(value) > 2000:
        raise ValueError("Link is too long (max 2000 characters).")
    return value


class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None

class CourseCreate(CourseBase):
    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _clean_title(value, 100)

    @field_validator("description")
    @classmethod
    def check_description(cls, value: Optional[str]) -> Optional[str]:
        return _clean_description(value)

# every field is optional; only the ones sent are changed
class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Title can't be empty.")
        return _clean_title(value, 100)

    @field_validator("description")
    @classmethod
    def check_description(cls, value: Optional[str]) -> Optional[str]:
        return _clean_description(value)

class CourseOut(CourseBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CourseMaterialOut(BaseModel):
    id: int
    course_id: int
    file_name: str
    file_path: str
    size_bytes: int
    is_rag_indexed: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CourseMaterialUpdate(BaseModel):
    file_name: str

    @field_validator("file_name")
    @classmethod
    def check_file_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name can't be empty.")
        if len(value) > 255:
            raise ValueError("Name is too long (max 255 characters).")
        return value

class CourseNoteBase(BaseModel):
    title: Optional[str] = None
    content: str

class CourseNoteCreate(CourseNoteBase):
    pass

class CourseNoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

    @field_validator("content")
    @classmethod
    def check_content(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Content can't be null.")
        return value

class CourseNoteOut(CourseNoteBase):
    id: int
    course_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CourseLinkBase(BaseModel):
    title: str
    url: str

class CourseLinkCreate(CourseLinkBase):
    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _clean_title(value, 200)

    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        return _clean_url(value)

class CourseLinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None

    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Title can't be empty.")
        return _clean_title(value, 200)

    @field_validator("url")
    @classmethod
    def check_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Link can't be empty.")
        return _clean_url(value)

class CourseLinkOut(CourseLinkBase):
    id: int
    course_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CourseDetailOut(CourseOut):
    materials: List[CourseMaterialOut]
    notes: List[CourseNoteOut]
    links: List[CourseLinkOut]