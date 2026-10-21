import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.admin.models import AdminLog
from backend.admin.schemas import AdminLogOut, AdminLogPage
from backend.core.dependencies import get_admin
from backend.database import get_db

router = APIRouter()


@router.get("/log", response_model=AdminLogPage, dependencies=[Depends(get_admin)])
def list_admin_log(
    action: str = Query("", max_length=40, description="One action; empty for all."),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Everything the admin did, newest first."""
    query = db.query(AdminLog)
    if action:
        query = query.filter(AdminLog.action == action)
    total = query.count()
    rows = query.order_by(AdminLog.created_at.desc(), AdminLog.id.desc()).offset(offset).limit(limit).all()
    actions = [a for (a,) in db.query(AdminLog.action).distinct().order_by(AdminLog.action).all()]
    return AdminLogPage(
        items=[
            AdminLogOut(
                id=row.id,
                action=row.action,
                target_type=row.target_type,
                target_id=row.target_id,
                details=json.loads(row.details) if row.details else {},
                created_at=row.created_at,
            )
            for row in rows
        ],
        total=total,
        actions=actions,
    )
