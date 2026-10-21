from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from backend.admin.schemas import (
    AdminContactOut,
    AdminContactPage,
    HandledRequest,
    OpenCount,
)
from backend.contact.models import ContactMessage
from backend.core.dependencies import get_admin
from backend.database import get_db, utc_now

router = APIRouter()


@router.get("/contact", response_model=AdminContactPage, dependencies=[Depends(get_admin)])
def list_contact_messages(
    status_filter: str = Query("open", alias="status", pattern="^(open|handled|all)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """ "Contact us" messages, newest first. They were also emailed to CONTACT_EMAIL when sent."""
    query = db.query(ContactMessage)
    if status_filter == "open":
        query = query.filter(ContactMessage.handled_at.is_(None))
    elif status_filter == "handled":
        query = query.filter(ContactMessage.handled_at.isnot(None))
    total = query.count()
    items = (
        query.options(joinedload(ContactMessage.sender))
        .order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AdminContactPage(items=items, total=total)


@router.get("/contact/count", response_model=OpenCount, dependencies=[Depends(get_admin)])
def count_contact_messages(db: Session = Depends(get_db)):
    """Messages not marked handled yet, for the tab's badge."""
    return OpenCount(count=db.query(ContactMessage).filter(ContactMessage.handled_at.is_(None)).count())


# marks a contact message handled, or open again
@router.post("/contact/{message_id}/handled", response_model=AdminContactOut, dependencies=[Depends(get_admin)])
def mark_contact_handled(message_id: int, data: HandledRequest, db: Session = Depends(get_db)):
    message = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    message.handled_at = utc_now() if data.handled else None
    db.commit()
    db.refresh(message)
    return message
