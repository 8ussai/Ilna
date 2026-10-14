from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.database import Base


class StudyItem(Base):
    """A summary or quiz Gemini wrote from some of a course's files, recordings and notes.

    Each one exists in Arabic and English: it's written in its main language, then that version is
    translated, so both say the same thing (and a quiz's options keep their order, so grading by
    option index works in either language)."""
    __tablename__ = "study_items"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)

    # "summary" or "quiz"
    kind = Column(String, nullable=False)
    # set only when the user renames it; otherwise each language shows its generated title
    title = Column(String, nullable=True)

    # the main version: "pending", "processing", "done" or "failed"
    status = Column(String, nullable=False, default="pending")
    error = Column(String, nullable=True)
    # what the user asked for ("ar"/"en", null = the material's own language)
    requested_language = Column(String, nullable=True)
    # the language the main version was written in; set when it's done
    main_language = Column(String, nullable=True)
    # the other language's version, made after the main one: same statuses, null until then
    translation_status = Column(String, nullable=True)
    translation_error = Column(String, nullable=True)
    # the language this item was last read in; null = its main language
    view_language = Column(String, nullable=True)

    # JSON: {"length": "brief"|"detailed"} for summaries, {"num_questions": n} for quizzes
    options = Column(Text, nullable=False)
    # JSON list of {"type": "material"|"note", "id", "kind", "name"}: a snapshot, so it still reads right after a source is deleted
    sources = Column(Text, nullable=False)
    # JSON {"en": {...}, "ar": {...}}; quizzes keep their answers here and the API never sends them before an attempt
    content = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="study_items")
    attempts = relationship(
        "QuizAttempt", back_populates="item", cascade="all, delete-orphan", order_by="QuizAttempt.id"
    )


class QuizAttempt(Base):
    """One finished go at a quiz, graded on the server."""
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("study_items.id", ondelete="CASCADE"), nullable=False, index=True)

    # JSON list with the chosen option index per question, null where it was left unanswered
    answers = Column(Text, nullable=False)
    score = Column(Integer, nullable=False)
    total = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), default=func.now())

    item = relationship("StudyItem", back_populates="attempts")


class StudyGeneration(Base):
    """A summary or quiz the user started; what the daily limits count, so deleting one doesn't refund it."""
    __tablename__ = "study_generations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # "summary" or "quiz", each with its own limit
    kind = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now())
