import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.admin.account import get_admin_account
from backend.admin.models import AdminLog
from backend.admin.schemas import AdminMessageCreate, MessageAudience, RecipientCount
from backend.core.dependencies import get_admin
from backend.database import get_db
from backend.notifications.models import Notification
from backend.notifications.service import NotificationType

router = APIRouter()


def _recipients(db: Session, audience: MessageAudience):
    """The students a message would reach; never the hidden admin account."""
    query = db.query(User.id).filter(User.is_system.is_(False))
    if audience.target == "user":
        if audience.user_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Pick a user")
        return query.filter(User.id == audience.user_id)
    if audience.target == "everyone":
        return query
    if not audience.value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Pick a {audience.target}")
    column = {"university": User.university, "college": User.college, "major": User.major}[audience.target]
    return query.filter(column == audience.value)


@router.post("/messages/preview", response_model=RecipientCount, dependencies=[Depends(get_admin)])
def preview_message(audience: MessageAudience, db: Session = Depends(get_db)):
    """How many students a message would go to, shown before sending."""
    return RecipientCount(count=_recipients(db, audience).count())


@router.post("/messages", response_model=RecipientCount, dependencies=[Depends(get_admin)])
def send_message(data: AdminMessageCreate, db: Session = Depends(get_db)):
    """Puts the message in each student's notifications, from Ilna Admin."""
    recipient_ids = [user_id for (user_id,) in _recipients(db, data).all()]
    if not recipient_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nobody to send to")
    # someone signed up (or was deleted) since the count was shown; show the new count first
    if len(recipient_ids) != data.confirm_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "count_changed", "count": len(recipient_ids)}
        )

    admin_account_id = get_admin_account(db).id
    db.add_all(
        [
            Notification(
                user_id=user_id,
                actor_id=admin_account_id,
                type=NotificationType.admin_message.value,
                message=data.message,
            )
            for user_id in recipient_ids
        ]
    )
    db.add(
        AdminLog(
            action="message",
            target_type="user" if data.target == "user" else None,
            target_id=data.user_id if data.target == "user" else None,
            details=json.dumps(
                {
                    "to": data.target,
                    "value": data.value,
                    "user_id": data.user_id,
                    "recipients": len(recipient_ids),
                    "message": data.message,
                },
                ensure_ascii=False,
            ),
        )
    )
    db.commit()
    return RecipientCount(count=len(recipient_ids))
