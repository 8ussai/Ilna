import os

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
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


# a post in one of the four blogs
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

    # an admin post stays at the top of its blog until this time; null means not pinned
    pinned_until = Column(DateTime)

    # shown as "Anonymous N" to everyone but its author and the admin
    is_anonymous = Column(Boolean, nullable=False, default=False, server_default="0")
    # the author can switch is_anonymous once after posting
    anonymity_switched = Column(Boolean, nullable=False, default=False, server_default="0")
    # the last "Anonymous N" number given out in this thread, so numbers are never reused
    anon_counter = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    author = relationship("User", back_populates="posts")
    votes = relationship("PostVote", back_populates="post", cascade="all, delete-orphan")
    replies = relationship("Reply", back_populates="post", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="post", cascade="all, delete-orphan")
    anon_numbers = relationship("ThreadAnonNumber", cascade="all, delete-orphan")
    images = relationship("PostImage", cascade="all, delete-orphan", order_by="PostImage.position")


class PostImage(Base):
    """A picture in a post, shrunk and saved as WebP with its photo details (EXIF, GPS) removed."""

    __tablename__ = "post_images"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    # the uploader, so the pictures count toward their storage
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # 0-based order in the post
    position = Column(Integer, nullable=False)
    # a random name under POST_IMAGE_DIR; nothing in it points back to the user
    file_path = Column(String, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    # an animated GIF (or WebP/PNG), kept animated
    is_animated = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=func.now())

    @property
    def version(self) -> str:
        """The file's random name. SQLite hands a deleted post's ids to the next post, so pages add this
        to the picture's address: a browser that cached the old picture can't show it for the new one."""
        return os.path.splitext(os.path.basename(self.file_path))[0]


class ThreadAnonNumber(Base):
    """Each person who posts or replies anonymously in a thread keeps one number there: "Anonymous 2"."""

    __tablename__ = "thread_anon_numbers"

    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    number = Column(Integer, nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint("post_id", "user_id"),
        UniqueConstraint("post_id", "number"),
    )


# one user's vote on a post: 1 or -1
class PostVote(Base):
    __tablename__ = "post_votes"

    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    vote_dir = Column(Integer, nullable=False)

    __table_args__ = (PrimaryKeyConstraint("post_id", "user_id"),)

    post = relationship("Post", back_populates="votes")


# a reply to a post or to another reply
class Reply(Base):
    __tablename__ = "replies"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    # null for a direct reply to the post, otherwise the reply being answered
    parent_id = Column(Integer, ForeignKey("replies.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    content = Column(Text, nullable=False)
    # a deleted reply that still has answers stays as a "[deleted]" placeholder so the thread holds together
    is_deleted = Column(Boolean, nullable=False, default=False)
    # the admin removed it; its placeholder reads "[removed by admin]" instead of "[deleted]"
    removed_by_admin = Column(Boolean, nullable=False, default=False)
    # shown as "Anonymous N" (its author's number in the thread); switchable once, like a post
    is_anonymous = Column(Boolean, nullable=False, default=False, server_default="0")
    anonymity_switched = Column(Boolean, nullable=False, default=False, server_default="0")

    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    post = relationship("Post", back_populates="replies")
    parent = relationship("Reply", remote_side=[id], back_populates="children")
    children = relationship("Reply", back_populates="parent")
    author = relationship("User")
    votes = relationship("ReplyVote", back_populates="reply", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="reply", cascade="all, delete-orphan")


# one user's vote on a reply: 1 or -1
class ReplyVote(Base):
    __tablename__ = "reply_votes"

    reply_id = Column(Integer, ForeignKey("replies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    vote_dir = Column(Integer, nullable=False)

    __table_args__ = (PrimaryKeyConstraint("reply_id", "user_id"),)

    reply = relationship("Reply", back_populates="votes")


class Report(Base):
    """A student flagging a post or a reply; exactly one of post_id and reply_id is set."""

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=True, index=True)
    reply_id = Column(Integer, ForeignKey("replies.id", ondelete="CASCADE"), nullable=True, index=True)

    # spam, harassment, inappropriate or other
    reason = Column(String, nullable=False)
    note = Column(Text)

    # open until the admin removes the content or dismisses the report
    status = Column(String, nullable=False, default="open", index=True)
    created_at = Column(DateTime(timezone=True), default=func.now())
    resolved_at = Column(DateTime(timezone=True))

    # one report per student per item; SQLite lets the null side of each pair repeat
    __table_args__ = (
        UniqueConstraint("reporter_id", "post_id", name="uq_reports_reporter_post"),
        UniqueConstraint("reporter_id", "reply_id", name="uq_reports_reporter_reply"),
    )

    reporter = relationship("User", foreign_keys=[reporter_id])
    post = relationship("Post")
    reply = relationship("Reply")
