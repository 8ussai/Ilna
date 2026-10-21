from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from backend.database import Base


class ContactMessage(Base):
    """A "Contact us" message that was emailed; also what the hourly limit counts, and what the admin panel lists."""

    __tablename__ = "contact_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    subject = Column(String, nullable=False)
    message = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), default=func.now())
    # set when the admin marks it handled in the panel; null while it's still open
    handled_at = Column(DateTime)

    sender = relationship("User")
