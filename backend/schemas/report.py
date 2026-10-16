from enum import Enum
from typing import Optional

from pydantic import BaseModel, field_validator


class ReportReason(str, Enum):
    spam = "spam"
    harassment = "harassment"
    inappropriate = "inappropriate"
    other = "other"


class ReportCreate(BaseModel):
    reason: ReportReason
    # optional detail for the admin; only the admin ever sees it
    note: Optional[str] = None

    @field_validator("note")
    @classmethod
    def check_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if len(value) > 500:
            raise ValueError("Note is too long (max 500 characters).")
        return value or None
