from sqlalchemy import Column, DateTime, ForeignKey, Integer, PrimaryKeyConstraint
from sqlalchemy.sql import func

from backend.database import Base


class Friend(Base):
    """user_id added friend_id to their friends list. One-way: friend_id isn't asked, told, or shown who added them."""

    __tablename__ = "friends"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=func.now())

    __table_args__ = (PrimaryKeyConstraint("user_id", "friend_id"),)
