from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List

class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None

class CourseCreate(CourseBase):
    pass

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

class CourseNoteBase(BaseModel):
    title: Optional[str] = None
    content: str

class CourseNoteCreate(CourseNoteBase):
    pass

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
    pass

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