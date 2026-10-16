from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

from backend.backendConfig import MAINTENANCE_MESSAGE_MAX


class MaintenanceStatus(BaseModel):
    # off, scheduled (starts later) or on (closed now)
    state: Literal["off", "scheduled", "on"]
    # null when off; times are UTC
    message: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    # the countdown runs on this, not the visitor's clock
    server_now: datetime
    # a test user's login opened from the admin panel, which may use the site while it's closed
    bypass: bool = False


def _to_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Stored times are UTC without an offset; a time with no offset is taken as UTC."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class MaintenanceSchedule(BaseModel):
    message: str
    # null = now
    starts_at: Optional[datetime] = None
    ends_at: datetime

    @field_validator("message")
    @classmethod
    def check_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Write a message for visitors.")
        if len(value) > MAINTENANCE_MESSAGE_MAX:
            raise ValueError(f"Message is too long (max {MAINTENANCE_MESSAGE_MAX} characters).")
        return value

    @field_validator("starts_at", "ends_at")
    @classmethod
    def check_time(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _to_utc(value)


class MaintenanceBypass(BaseModel):
    # a login for the test user; the admin panel puts it where the site reads it, then opens the site
    token: str
    expires_at: datetime
