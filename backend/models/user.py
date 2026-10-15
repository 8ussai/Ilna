from sqlalchemy import Boolean, Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    
    country = Column(String, nullable=False)
    university = Column(String, nullable=False)
    college = Column(String, nullable=False)
    major = Column(String, nullable=False)

    # false until the 6-digit code emailed at sign-up is entered; such accounts can't log in
    is_verified = Column(Boolean, nullable=False, default=False)
    # bcrypt hash of the current code, cleared once used
    otp_hash = Column(String)
    otp_sent_at = Column(DateTime)
    otp_expires_at = Column(DateTime)
    otp_attempts = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    posts = relationship("Post", back_populates="author")
    voted_posts = relationship("PostVote", back_populates="voter")

    courses = relationship("Course", back_populates="owner", cascade="all, delete-orphan")