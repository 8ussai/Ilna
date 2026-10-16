from typing import Optional

from fastapi import APIRouter, Header

from backend.schemas.maintenance import MaintenanceStatus
from backend.services import maintenance
from backend.services.catalog import CATALOG

router = APIRouter()


@router.get("/universities")
def get_universities():
    return CATALOG


@router.get("/status", response_model=MaintenanceStatus)
def get_status(authorization: Optional[str] = Header(default=None)):
    """Whether the site is closed for maintenance (or will be); answers while it's closed too.
    bypass is true for a test user's login opened from the admin panel, which may use the site anyway."""
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    return maintenance.status_out(maintenance.current_window(), bypass=bool(token) and maintenance.allows_bypass(token))
