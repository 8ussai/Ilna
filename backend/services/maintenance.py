"""The maintenance window: when the site is closed to students, with a message and a countdown.

The state comes from the clock alone, so the site opens again by itself at ends_at; nothing has to run then.
The window is read on every request, so it's cached for a few seconds and dropped whenever the admin changes it."""
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional

from backend.backendConfig import MAINTENANCE_CACHE_SECONDS
from backend.core.security import is_maintenance_bypass
from backend.database import SessionLocal, utc_now
from backend.models.admin import Maintenance
from backend.schemas.maintenance import MaintenanceStatus

State = Literal["off", "scheduled", "on"]


@dataclass(frozen=True)
class Window:
    message: str
    # UTC, without an offset, like the other stored times
    starts_at: datetime
    ends_at: datetime


_cache: dict = {"read_at": 0.0, "window": None}


def current_window() -> Optional[Window]:
    """The saved window, or None; one that already ended counts as none."""
    if time.monotonic() - _cache["read_at"] > MAINTENANCE_CACHE_SECONDS:
        db = SessionLocal()
        try:
            row = db.get(Maintenance, 1)
            _cache["window"] = Window(row.message, row.starts_at, row.ends_at) if row else None
        finally:
            db.close()
        _cache["read_at"] = time.monotonic()
    window = _cache["window"]
    return window if window and window.ends_at > utc_now() else None


def forget_cached() -> None:
    """Call after the admin changes the window, so the change takes effect at once."""
    _cache["read_at"] = 0.0


def state(window: Optional[Window]) -> State:
    if window is None or window.ends_at <= utc_now():
        return "off"
    return "scheduled" if window.starts_at > utc_now() else "on"


def allows_bypass(token: str) -> bool:
    return is_maintenance_bypass(token)


def status_out(window: Optional[Window], bypass: bool = False) -> MaintenanceStatus:
    current = state(window)
    return MaintenanceStatus(
        state=current,
        message=window.message if window and current != "off" else None,
        starts_at=window.starts_at if window and current != "off" else None,
        ends_at=window.ends_at if window and current != "off" else None,
        server_now=utc_now(),
        bypass=bypass,
    )


def closed_detail(window: Window) -> dict:
    """The 503 detail while closed; the app shows the maintenance screen from it."""
    return {
        "code": "maintenance",
        "message": window.message,
        "starts_at": window.starts_at.isoformat(),
        "ends_at": window.ends_at.isoformat(),
        "server_now": utc_now().isoformat(),
    }
