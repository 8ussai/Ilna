import json
from enum import Enum

from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from datetime import datetime
from typing import Literal, Optional, List
from urllib.parse import urlparse

from backend.backendConfig import MAX_DRAWING_BYTES, MAX_TEXT_NOTE_CHARS


# preset names, not hex values, so the frontend can pick a shade that works in light and dark themes
class CourseColor(str, Enum):
    blue = "blue"
    green = "green"
    purple = "purple"
    orange = "orange"
    pink = "pink"
    teal = "teal"
    red = "red"
    gray = "gray"


class MaterialKind(str, Enum):
    document = "document"
    audio = "audio"


class NoteKind(str, Enum):
    text = "text"
    drawing = "drawing"


class TranscriptStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


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


def _clean_emoji(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    # one emoji can be several code points (skin tones, flags, families), so this only bounds the size
    if len(value) > 16 or any(char.isspace() for char in value):
        raise ValueError("Emoji must be a single emoji.")
    return value or None


def _clean_note_title(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if len(value) > 200:
        raise ValueError("Title is too long (max 200 characters).")
    return value or None


def check_note_content(kind: NoteKind, content: str) -> str:
    """Raises ValueError when the content doesn't fit the note's kind."""
    if kind == NoteKind.text:
        if len(content) > MAX_TEXT_NOTE_CHARS:
            raise ValueError(f"Note is too long (max {MAX_TEXT_NOTE_CHARS} characters).")
        return content

    if len(content.encode("utf-8")) > MAX_DRAWING_BYTES:
        raise ValueError("Drawing is too large to save.")
    try:
        drawing = json.loads(content)
    except ValueError:
        raise ValueError("Drawing must be JSON.")
    if not isinstance(drawing, dict) or not isinstance(drawing.get("strokes"), list):
        raise ValueError("Drawing must be an object with a list of strokes.")
    return content


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
    color: Optional[CourseColor] = None
    emoji: Optional[str] = None

class CourseCreate(CourseBase):
    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _clean_title(value, 100)

    @field_validator("description")
    @classmethod
    def check_description(cls, value: Optional[str]) -> Optional[str]:
        return _clean_description(value)

    @field_validator("emoji")
    @classmethod
    def check_emoji(cls, value: Optional[str]) -> Optional[str]:
        return _clean_emoji(value)

# every field is optional; only the ones sent are changed
class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    # null clears these
    color: Optional[CourseColor] = None
    emoji: Optional[str] = None

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

    @field_validator("emoji")
    @classmethod
    def check_emoji(cls, value: Optional[str]) -> Optional[str]:
        return _clean_emoji(value)

class CourseOut(CourseBase):
    id: int
    user_id: int
    last_opened_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# a card in the courses grid
class CourseSummaryOut(CourseOut):
    documents_count: int
    audio_count: int
    links_count: int
    notes_count: int

# shown with each recording; the segments come from the transcript route
class TranscriptSummaryOut(BaseModel):
    status: TranscriptStatus
    progress: float
    language: Optional[str] = None
    error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str

class TranscriptOut(TranscriptSummaryOut):
    segments: Optional[List[TranscriptSegment]] = None

    @field_validator("segments", mode="before")
    @classmethod
    def parse_segments(cls, value):
        # stored as JSON text
        return json.loads(value) if isinstance(value, str) else value

class TranscriptRetry(BaseModel):
    # null = detect the language
    language: Optional[Literal["ar", "en"]] = None

class CourseMaterialOut(BaseModel):
    id: int
    course_id: int
    file_name: str
    # file_path stays server-side; the file is fetched from the authenticated /file route
    kind: MaterialKind
    mime_type: Optional[str] = None
    duration_sec: Optional[float] = None
    size_bytes: int
    is_rag_indexed: bool
    # recordings only
    transcript: Optional[TranscriptSummaryOut] = None
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
    kind: NoteKind = NoteKind.text

    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        return _clean_note_title(value)

    @model_validator(mode="after")
    def check_content(self):
        check_note_content(self.kind, self.content)
        return self

# the kind can't change; the route checks content against the note's kind
class CourseNoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        return _clean_note_title(value)

    @field_validator("content")
    @classmethod
    def check_content(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Content can't be null.")
        return value

class CourseNoteOut(CourseNoteBase):
    id: int
    course_id: int
    kind: NoteKind
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