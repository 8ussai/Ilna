from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from backend.config import STUDY_MAX_SOURCES

Language = Literal["ar", "en"]


# what a study item is: a summary or a quiz
class StudyKind(str, Enum):
    summary = "summary"
    quiz = "quiz"


# where a summary or quiz is in being written
class StudyStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


# What Gemini writes. The descriptions are part of the schema it's given, so they double as instructions.


# one topic of a summary (also the shape Gemini is asked to fill)
class SummarySection(BaseModel):
    heading: str = Field(description="A short heading for one topic of the material.")
    points: List[str] = Field(description="The key points of this topic, each a complete sentence or two.")


# a term and its meaning, listed at the end of a summary
class KeyTerm(BaseModel):
    term: str
    definition: str = Field(description="What the term means, as the material uses it, in one sentence.")


# a whole summary in one language (the shape Gemini fills)
class SummaryContent(BaseModel):
    title: str = Field(description="A short title naming what the material covers.")
    overview: str = Field(description="What the material is about and its main ideas.")
    sections: List[SummarySection]
    key_terms: List[KeyTerm] = Field(description="Important terms a student should know, in the order they appear.")


# one multiple-choice question with its answer (the shape Gemini fills)
class QuizQuestion(BaseModel):
    question: str
    options: List[str] = Field(description="Exactly 4 answer options, one of them correct.")
    correct_index: int = Field(description="The position of the correct option in `options`, counting from 0.")
    explanation: str = Field(
        description="One or two sentences on why the correct option is right, based on the material."
    )


# a whole quiz in one language (the shape Gemini fills)
class QuizContent(BaseModel):
    title: str = Field(description="A short title naming what the quiz covers.")
    questions: List[QuizQuestion]


# API


# a file, recording or note picked to make a summary or quiz from
class StudySourceIn(BaseModel):
    type: Literal["material", "note"]
    id: int


# a new summary or quiz
class StudyCreate(BaseModel):
    kind: StudyKind
    sources: List[StudySourceIn]
    # the main language; null = the material's own language. The other language follows by itself.
    language: Optional[Language] = None
    # summaries only
    length: Literal["brief", "detailed"] = "brief"
    # quizzes only
    num_questions: Literal[5, 10, 15, 20] = 10

    # one to STUDY_MAX_SOURCES sources, none twice
    @field_validator("sources")
    @classmethod
    def check_sources(cls, value: List[StudySourceIn]) -> List[StudySourceIn]:
        if not value:
            raise ValueError("Choose at least one file, recording or note.")
        if len(value) > STUDY_MAX_SOURCES:
            raise ValueError(f"Choose at most {STUDY_MAX_SOURCES} sources.")
        if len({(s.type, s.id) for s in value}) != len(value):
            raise ValueError("A source was chosen twice.")
        return value


# renaming a summary or quiz, or remembering its reading language
class StudyItemUpdate(BaseModel):
    # null goes back to the generated title
    title: Optional[str] = None
    view_language: Optional[Language] = None

    # optional title, up to 200 characters; empty goes back to the generated one
    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if len(value) > 200:
            raise ValueError("Title is too long (max 200 characters).")
        return value or None

    # a sent view_language can't be null
    @field_validator("view_language")
    @classmethod
    def check_view_language(cls, value: Optional[Language]) -> Optional[Language]:
        if value is None:
            raise ValueError("view_language must be 'ar' or 'en'.")
        return value


# a source a summary or quiz was made from, as it was then
class StudySourceOut(BaseModel):
    type: Literal["material", "note"]
    id: int
    # "document", "audio" or "text"
    kind: str
    name: str


class StudyItemSummaryOut(BaseModel):
    """A card in the course's Summaries & quizzes tab."""

    id: int
    course_id: int
    kind: StudyKind
    # the user's own title, if they renamed it; otherwise show titles[language]
    title: Optional[str]
    titles: dict[str, str]
    status: StudyStatus
    # the English detail, and a code the page words in its own language (study_generator.ERRORS, or "other")
    error: Optional[str]
    error_code: Optional[str]
    requested_language: Optional[Language]
    main_language: Optional[Language]
    translation_status: Optional[StudyStatus]
    translation_error: Optional[str]
    translation_error_code: Optional[str]
    # the language to open it in
    view_language: Optional[Language]
    options: dict
    sources: List[StudySourceOut]
    # quizzes only
    question_count: Optional[int] = None
    attempts_count: int = 0
    last_score: Optional[int] = None
    best_score: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class QuizQuestionPublic(BaseModel):
    """A question as it's shown while taking the quiz: no answer, no explanation."""

    question: str
    options: List[str]


# a quiz as students get it: without the answers
class QuizPublic(BaseModel):
    title: str
    questions: List[QuizQuestionPublic]


# a summary or quiz with its content in each ready language
class StudyItemOut(StudyItemSummaryOut):
    # by language; only the versions that are ready
    summary: Optional[dict[str, SummaryContent]] = None
    quiz: Optional[dict[str, QuizPublic]] = None


# a finished quiz's answers, to be graded
class AttemptCreate(BaseModel):
    # the chosen option index for each question, in order; null = left unanswered (counts as wrong)
    answers: List[Optional[int]]


# how one question went, with its explanation
class QuestionResult(BaseModel):
    chosen: Optional[int]
    correct_index: int
    is_correct: bool
    # by language, like the quiz itself
    explanation: dict[str, str]


# a graded quiz attempt
class AttemptOut(BaseModel):
    id: int
    score: int
    total: int
    results: List[QuestionResult]
    created_at: datetime
