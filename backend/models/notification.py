from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.database import Base


class Notification(Base):
    """Someone voted on or replied to the recipient's post or reply."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    # who gets notified
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # who voted or replied
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # post_vote, reply_vote, post_reply or reply_reply (see NotificationType)
    type = Column(String, nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    # the voted reply for reply_vote; the new reply for post_reply and reply_reply; null for post_vote
    reply_id = Column(Integer, ForeignKey("replies.id", ondelete="CASCADE"), nullable=True)
    # 1 or -1 for votes, null for replies
    vote_dir = Column(Integer, nullable=True)

    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=func.now())

    # the unread badge count and the history page both filter by recipient
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "is_read"),)

    actor = relationship("User", foreign_keys=[actor_id])
    post = relationship("Post", back_populates="notifications")
    reply = relationship("Reply", back_populates="notifications")
