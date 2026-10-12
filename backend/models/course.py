from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database import Base

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="courses")
    materials = relationship("CourseMaterial", back_populates="course", cascade="all, delete-orphan")
    notes = relationship("CourseNote", back_populates="course", cascade="all, delete-orphan")
    links = relationship("CourseLink", back_populates="course", cascade="all, delete-orphan")


class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    # recorded at upload so storage usage is a single SUM instead of reading every file from disk
    size_bytes = Column(Integer, nullable=False, default=0, server_default="0")

    is_rag_indexed = Column(Boolean, default=False) 
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="materials")


class CourseNote(Base):
    __tablename__ = "course_notes"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
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