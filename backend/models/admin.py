from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.database import Base


class AdminCode(Base):
    """A login code emailed to ADMIN_EMAIL; there's one admin, so only the newest row matters."""
    __tablename__ = "admin_codes"

    id = Column(Integer, primary_key=True, index=True)
    # bcrypt hash of the 6-digit code, cleared once used
    code_hash = Column(String)
    sent_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)


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


class AdminLog(Base):
    """Every admin action, with what was removed kept in details so nothing is lost by mistake."""
    __tablename__ = "admin_log"

    id = Column(Integer, primary_key=True, index=True)
    # e.g. ban, unban, remove_post, remove_reply, delete_user, message, admin_post
    action = Column(String, nullable=False)
    # user, post or reply; null for actions without one target (e.g. a message to everyone)
    target_type = Column(String)
    target_id = Column(Integer)
    # JSON: the reason, the removed text, who a message went to, ...
    details = Column(Text)
    created_at = Column(DateTime(timezone=True), default=func.now())

    __table_args__ = (Index("ix_admin_log_created", "created_at"),)
