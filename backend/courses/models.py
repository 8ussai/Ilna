from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.database import Base


# a student's course: their files, recordings, links and notes for one subject
class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    # one of the preset names in courses/schemas.py CourseColor; the frontend maps it to a theme color
    color = Column(String, nullable=True)
    # set when the owner opens the course page; the courses grid sorts by it (members have their own)
    last_opened_at = Column(DateTime(timezone=True), nullable=True)
    # the course ID people type to add it, like "K7Q2-M9XD" (courses/sharing.py); random, so
    # private courses can't be found by counting. The owner can swap it for a new one.
    share_code = Column(String, nullable=False, unique=True, index=True)
    # anyone with the code can add a public course; a private one only reaches the people it's shared with
    is_public = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="courses")
    shares = relationship("CourseShare", back_populates="course", cascade="all, delete-orphan")
    members = relationship("CourseMember", back_populates="course", cascade="all, delete-orphan")
    share_responses = relationship("CourseShareResponse", cascade="all, delete-orphan")
    materials = relationship("CourseMaterial", back_populates="course", cascade="all, delete-orphan")
    notes = relationship("CourseNote", back_populates="course", cascade="all, delete-orphan")
    links = relationship("CourseLink", back_populates="course", cascade="all, delete-orphan")
    study_items = relationship("StudyItem", back_populates="course", cascade="all, delete-orphan")


class CourseShare(Base):
    """Who a private course is shared with. target_type is university, college or major (target is the owner's
    catalog id), friends (the owner's friends list, as it is now), or user (target is their user id)."""

    __tablename__ = "course_shares"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String, nullable=False)
    target = Column(String, nullable=False, default="", server_default="")
    created_at = Column(DateTime(timezone=True), default=func.now())

    course = relationship("Course", back_populates="shares")

    __table_args__ = (UniqueConstraint("course_id", "target_type", "target"),)


class CourseMember(Base):
    """Someone who added another student's course: they can read it but not change it, while it's
    public or still shared with them (see courses/sharing.py)."""

    __tablename__ = "course_members"

    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # their own "recently opened", for sorting their grid
    last_opened_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now())

    course = relationship("Course", back_populates="members")

    __table_args__ = (PrimaryKeyConstraint("course_id", "user_id"),)


class CourseShareResponse(Base):
    """The user pressed Ignore on a course shared with them (or left it), so it stays out of "Shared with you"."""

    __tablename__ = "course_share_responses"

    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=func.now())

    __table_args__ = (PrimaryKeyConstraint("course_id", "user_id"),)


# a file or recording in a course
class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)

    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    # "document" (pdf/ppt, indexed for AI directly) or "audio" (transcribed first)
    kind = Column(String, nullable=False, default="document", server_default="document")
    mime_type = Column(String, nullable=True)
    # audio length as reported by the browser; null for documents
    duration_sec = Column(Float, nullable=True)
    # recorded at upload so storage usage is a single SUM instead of reading every file from disk
    size_bytes = Column(Integer, nullable=False, default=0, server_default="0")

    is_rag_indexed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="materials")
    transcript = relationship(
        "MaterialTranscript", back_populates="material", uselist=False, cascade="all, delete-orphan"
    )


# a typed or drawn note in a course
class CourseNote(Base):
    __tablename__ = "course_notes"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String, nullable=True)
    # "text" (content is the text) or "drawing" (content is the stroke JSON)
    kind = Column(String, nullable=False, default="text", server_default="text")
    content = Column(Text, nullable=False)
    # when the text was last embedded for AI search; behind updated_at means it needs doing again
    indexed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="notes")


# a saved web link in a course
class CourseLink(Base):
    __tablename__ = "course_links"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String, nullable=False)
    url = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="links")


# a recording's transcription and its progress
class MaterialTranscript(Base):
    __tablename__ = "material_transcripts"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(
        Integer, ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )

    # "pending", "done" or "failed"
    status = Column(String, nullable=False, default="pending")
    # 0..1 while transcribing
    progress = Column(Float, nullable=False, default=0)
    # chosen on upload ("ar"/"en", null = detect); replaced by the detected language when done
    language = Column(String, nullable=True)
    # JSON list of {"start": seconds, "end": seconds, "text": "..."}
    segments = Column(Text, nullable=True)
    error = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    material = relationship("CourseMaterial", back_populates="transcript")


# registers StudyItem, which Course.study_items names, for code that only imports this module
