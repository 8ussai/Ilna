import json
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from backend.config import MAX_DRAWING_BYTES, MAX_DRAWING_PAGES, MAX_TEXT_NOTE_CHARS


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


# a course file: slides (document) or a lecture recording (audio)
class MaterialKind(str, Enum):
    document = "document"
    audio = "audio"


# a typed note, or a hand-drawn one stored as stroke JSON
class NoteKind(str, Enum):
    text = "text"
    drawing = "drawing"


# where a recording's transcription is
class TranscriptStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


# trims a title and checks it's there and not too long
def _clean_title(value: str, max_length: int) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Title can't be empty.")
    if len(value) > max_length:
        raise ValueError(f"Title is too long (max {max_length} characters).")
    return value


# trims a description; an emptied one becomes no description
def _clean_description(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if len(value) > 500:
        raise ValueError("Description is too long (max 500 characters).")
    # an emptied description is stored as no description
    return value or None


# trims a note title; an emptied one becomes no title
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
    if not isinstance(drawing, dict):
        raise ValueError("Drawing must be an object.")
    # version 2: a list of pages, each with its strokes
    if "pages" in drawing:
        pages = drawing["pages"]
        if not isinstance(pages, list) or not pages:
            raise ValueError("Drawing must have at least one page.")
        if len(pages) > MAX_DRAWING_PAGES:
            raise ValueError(f"Drawing has too many pages (max {MAX_DRAWING_PAGES}).")
        if not all(isinstance(page, dict) and isinstance(page.get("strokes"), list) for page in pages):
            raise ValueError("Each drawing page must have a list of strokes.")
        return content
    # version 1: one page of strokes
    if not isinstance(drawing.get("strokes"), list):
        raise ValueError("Drawing must have pages or a list of strokes.")
    return content


# checks a link is a full http(s) web address
def _clean_url(value: str) -> str:
    value = value.strip()
    parsed = urlparse(value)
    # only web links, so a saved link can never run javascript: or open a local file when clicked
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Link must be a full web address starting with http:// or https://.")
    if len(value) > 2000:
        raise ValueError("Link is too long (max 2000 characters).")
    return value


# the fields a course is made with and shown with
class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    color: Optional[CourseColor] = None


# a new course
class CourseCreate(CourseBase):
    # course titles: up to 100 characters
    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _clean_title(value, 100)

    # optional description, up to 500 characters
    @field_validator("description")
    @classmethod
    def check_description(cls, value: Optional[str]) -> Optional[str]:
        return _clean_description(value)


# every field is optional; only the ones sent are changed
class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    # null clears these
    color: Optional[CourseColor] = None

    # a sent title can't be null or empty
    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Title can't be empty.")
        return _clean_title(value, 100)

    # optional description, up to 500 characters
    @field_validator("description")
    @classmethod
    def check_description(cls, value: Optional[str]) -> Optional[str]:
        return _clean_description(value)


# whose course it is, shown on courses someone added from another student
class CourseOwner(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    is_premium: bool = False

    model_config = ConfigDict(from_attributes=True)


# a course as the viewer sees it (owner or member)
class CourseOut(CourseBase):
    id: int
    user_id: int
    # the viewer's own: the owner's, or when a member last opened it
    last_opened_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    is_public: bool = False
    # members see a download button on notes only when this is on
    notes_downloadable: bool = False
    # false for a course the viewer added (read-only, shown with a "Shared" tag)
    is_owner: bool = True
    # set on added courses, so the grid can say whose it is
    owner: Optional[CourseOwner] = None
    # the course ID; only its owner gets it
    share_code: Optional[str] = None

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


# one timed line of a transcript
class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


# a transcript with its timed lines
class TranscriptOut(TranscriptSummaryOut):
    segments: Optional[List[TranscriptSegment]] = None

    # the segments are stored as JSON text
    @field_validator("segments", mode="before")
    @classmethod
    def parse_segments(cls, value):
        # stored as JSON text
        return json.loads(value) if isinstance(value, str) else value


# transcribe a recording again, optionally in a set language
class TranscriptRetry(BaseModel):
    # null = detect the language
    language: Optional[Literal["ar", "en"]] = None


# a course file or recording as the page shows it
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


# renaming a course file
class CourseMaterialUpdate(BaseModel):
    file_name: str

    # file names: not empty, up to 255 characters
    @field_validator("file_name")
    @classmethod
    def check_file_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name can't be empty.")
        if len(value) > 255:
            raise ValueError("Name is too long (max 255 characters).")
        return value


# the fields a note is made with and shown with
class CourseNoteBase(BaseModel):
    title: Optional[str] = None
    content: str


# a new note
class CourseNoteCreate(CourseNoteBase):
    kind: NoteKind = NoteKind.text

    # optional note title, up to 200 characters
    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        return _clean_note_title(value)

    # the content's limit depends on the kind (text or drawing)
    @model_validator(mode="after")
    def check_content(self):
        check_note_content(self.kind, self.content)
        return self


# the kind can't change; the route checks content against the note's kind
class CourseNoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

    # optional note title, up to 200 characters
    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        return _clean_note_title(value)

    # content can be left out, but not sent as null
    @field_validator("content")
    @classmethod
    def check_content(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Content can't be null.")
        return value


# a note as the page shows it
class CourseNoteOut(CourseNoteBase):
    id: int
    course_id: int
    kind: NoteKind
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# the fields a link is made with and shown with
class CourseLinkBase(BaseModel):
    title: str
    url: str


# a new link
class CourseLinkCreate(CourseLinkBase):
    # link titles: up to 200 characters
    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _clean_title(value, 200)

    # only full http(s) addresses
    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        return _clean_url(value)


# changing a link's title or address
class CourseLinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None

    # a sent title can't be null or empty
    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Title can't be empty.")
        return _clean_title(value, 200)

    # a sent address can't be null; it must be full http(s)
    @field_validator("url")
    @classmethod
    def check_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Link can't be empty.")
        return _clean_url(value)


# a link as the page shows it
class CourseLinkOut(CourseLinkBase):
    id: int
    course_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# everything on a course's page
class CourseDetailOut(CourseOut):
    materials: List[CourseMaterialOut]
    notes: List[CourseNoteOut]
    links: List[CourseLinkOut]
