from sqlalchemy import Column, DateTime, Integer, Text
from sqlalchemy.sql import func

from backend.database import Base


class Maintenance(Base):
    """The one maintenance window, if any: the site is closed to students from starts_at to ends_at (UTC).
    Once ends_at passes the site is open again by itself; the row is just left behind until the next one."""

    __tablename__ = "maintenance"

    id = Column(Integer, primary_key=True)
    message = Column(Text, nullable=False)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
