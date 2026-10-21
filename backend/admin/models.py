from sqlalchemy import Column, DateTime, Index, Integer, String, Text
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
