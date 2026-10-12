import logging
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.backendConfig import CONTACT_MESSAGES_PER_HOUR
from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.contact import ContactMessage
from backend.models.user import User
from backend.schemas.contact import ContactCreate
from backend.services.email import send_contact_email, smtp_configured

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", status_code=status.HTTP_204_NO_CONTENT)
def send_contact_message(
    contact_data: ContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Contact messages aren't set up yet.",
        )

    # created_at is stored in UTC without an offset, so compare against a naive UTC time
    an_hour_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    sent_last_hour = (
        db.query(func.count(ContactMessage.id))
        .filter(ContactMessage.user_id == current_user.id, ContactMessage.created_at > an_hour_ago)
        .scalar()
    )
    if sent_last_hour >= CONTACT_MESSAGES_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've sent too many messages. Please try again later.",
        )

    try:
        send_contact_email(current_user, contact_data.subject, contact_data.message)
    except (smtplib.SMTPException, OSError):
        logger.exception("Couldn't send contact message from user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send your message. Please try again later.",
        )

    # recorded only once sent, so a failed attempt doesn't count toward the limit
    db.add(ContactMessage(user_id=current_user.id, subject=contact_data.subject, message=contact_data.message))
    db.commit()
