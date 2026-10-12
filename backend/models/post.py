from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, PrimaryKeyConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database import Base


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    content = Column(Text, nullable=False)

    # which blog the post belongs to: general, university, college or major
    scope = Column(String, nullable=False, default="general", server_default="general", index=True)

    # author's catalog ids at posting time; used to match scoped blogs
    university = Column(String, nullable=False, index=True)
    college = Column(String, nullable=False, index=True)
    major = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    author = relationship("User", back_populates="posts")
    votes = relationship("PostVote", back_populates="post", cascade="all, delete-orphan")


class PostVote(Base):
    __tablename__ = "post_votes"

    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    vote_dir = Column(Integer, nullable=False)

    __table_args__ = (PrimaryKeyConstraint("post_id", "user_id"),)

    post = relationship("Post", back_populates="votes")
    voter = relationship("User", back_populates="voted_posts")
