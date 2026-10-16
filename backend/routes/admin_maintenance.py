import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.backendConfig import MAINTENANCE_MAX_WINDOW
from backend.core.apiDependencies import get_admin
from backend.core.security import create_maintenance_bypass_token
from backend.database import get_db, utc_now
from backend.models.admin import AdminLog, Maintenance
from backend.models.user import User
from backend.schemas.maintenance import MaintenanceBypass, MaintenanceSchedule, MaintenanceStatus
from backend.services import maintenance

router = APIRouter(dependencies=[Depends(get_admin)])


def _window_details(row: Maintenance) -> dict:
    return {"message": row.message, "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat()}


@router.get("", response_model=MaintenanceStatus)
def get_maintenance():
    return maintenance.status_out(maintenance.current_window())


@router.put("", response_model=MaintenanceStatus)
def schedule_maintenance(data: MaintenanceSchedule, db: Session = Depends(get_db)):
    """Closes the site from starts_at (or now) until ends_at; also changes a window that's scheduled or on."""
    now = utc_now()
    # a start in the past means now
    starts_at = max(data.starts_at or now, now)
    if data.ends_at <= starts_at + timedelta(minutes=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The end has to be after the start.")
    if data.ends_at - starts_at > MAINTENANCE_MAX_WINDOW:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The site can be closed for at most 30 days.")

    row = db.get(Maintenance, 1)
    # a window that's on keeps its start; changing it only moves the end or the message
    if row and row.starts_at <= now < row.ends_at:
        starts_at = row.starts_at
    if row is None:
        row = Maintenance(id=1)
        db.add(row)
    row.message = data.message
    row.starts_at = starts_at
    row.ends_at = data.ends_at
    db.add(AdminLog(action="maintenance_schedule", details=json.dumps(_window_details(row), ensure_ascii=False)))
    db.commit()
    maintenance.forget_cached()
    return maintenance.status_out(maintenance.current_window())


@router.delete("", response_model=MaintenanceStatus)
def end_maintenance(db: Session = Depends(get_db)):
    """Opens the site now, or cancels a scheduled window."""
    row = db.get(Maintenance, 1)
    if row and row.ends_at > utc_now():
        details = _window_details(row)
        details["was"] = maintenance.state(maintenance.Window(row.message, row.starts_at, row.ends_at))
        db.add(AdminLog(action="maintenance_end", details=json.dumps(details, ensure_ascii=False)))
        db.delete(row)
        db.commit()
        maintenance.forget_cached()
    return maintenance.status_out(maintenance.current_window())


@router.post("/enter/{user_id}", response_model=MaintenanceBypass)
def enter_as_test_user(user_id: int, db: Session = Depends(get_db)):
    """A login for a test user that may use the site while it's closed, until the window ends."""
    window = maintenance.current_window()
    if window is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The site isn't closed or scheduled to close.")
    user = db.query(User).filter(User.id == user_id, User.is_test.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test user not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This test user is turned off.")

    db.add(AdminLog(action="maintenance_enter", target_type="user", target_id=user.id,
                    details=json.dumps({"username": user.username}, ensure_ascii=False)))
    db.commit()
    return MaintenanceBypass(token=create_maintenance_bypass_token(user.id, window.ends_at), expires_at=window.ends_at)
