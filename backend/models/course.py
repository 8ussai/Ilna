from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database import Base

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    # one of the preset names in schemas.course.CourseColor; the frontend maps it to a theme color
    color = Column(String, nullable=True)
    # set when the course page opens; the courses grid sorts by it
    last_opened_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="courses")
    materials = relationship("CourseMaterial", back_populates="course", cascade="all, delete-orphan")
    notes = relationship("CourseNote", back_populates="course", cascade="all, delete-orphan")
    links = relationship("CourseLink", back_populates="course", cascade="all, delete-orphan")
    study_items = relationship("StudyItem", back_populates="course", cascade="all, delete-orphan")


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


class CourseLink(Base):
    __tablename__ = "course_links"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="links")


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
from backend.models import study  # noqa: E402,F401
