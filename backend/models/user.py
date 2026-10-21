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

    # the "Forgot password?" code, kept apart from the sign-up code; bcrypt hash, cleared once used
    reset_hash = Column(String)
    reset_sent_at = Column(DateTime)
    reset_expires_at = Column(DateTime)
    reset_attempts = Column(Integer, nullable=False, default=0)
    # UTC; logins issued before this are rejected, so a new password logs out every session
    password_changed_at = Column(DateTime)

    # a banned user is logged out and can't log in again until unbanned
    is_banned = Column(Boolean, nullable=False, default=False)
    banned_reason = Column(String)
    banned_at = Column(DateTime)
    # turned on from the admin panel, and stays until turned off there: more summaries, quizzes and storage, and a gold name
    is_premium = Column(Boolean, nullable=False, default=False)
    premium_since = Column(DateTime)
    # the site's theme color: a preset name (ACCENT_PRESETS), or for premium a custom "#rrggbb"; empty is the default orange
    accent_color = Column(String)
    # made by the admin, named testuser{id}, with no real email: can use everything but the blogs' posting,
    # replying and voting, and Contact us. The admin can turn it off, and can always see its password.
    is_test = Column(Boolean, nullable=False, default=False)
    # only test accounts are ever turned off; an off account can't log in and is logged out at once
    is_active = Column(Boolean, nullable=False, default=True)
    # the test account's password, encrypted with a key from SECRET_KEY so the admin panel can show it again
    test_password_enc = Column(String)
    # the hidden "Ilna Admin" account that owns the admin's posts and messages; it can never log in
    is_system = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    posts = relationship("Post", back_populates="author")
    voted_posts = relationship("PostVote", back_populates="voter")

    courses = relationship("Course", back_populates="owner", cascade="all, delete-orphan")