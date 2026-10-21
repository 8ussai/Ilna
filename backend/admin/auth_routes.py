import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend import config
from backend.admin.models import AdminCode, AdminLog
from backend.admin.schemas import (
    AdminCodeRequest,
    AdminCodeVerify,
    AdminSession,
    AdminToken,
)
from backend.core.dependencies import get_admin
from backend.core.email import send_admin_code_email, smtp_configured
from backend.core.security import create_admin_token, get_password_hash, verify_password
from backend.database import SessionLocal, get_db, utc_now

router = APIRouter()


logger = logging.getLogger(__name__)


# the same reply whether or not the email is the admin's, so the form can't be used to find it out
CODE_REQUESTED = {"detail": "If that is the admin email, a code was sent."}


# whether this is the admin's email, compared in constant time
def _is_admin_email(email: str) -> bool:
    return bool(config.ADMIN_EMAIL) and secrets.compare_digest(
        email.strip().lower().encode(), config.ADMIN_EMAIL.encode()
    )


def _send_admin_code() -> None:
    """Makes and emails a new code unless one went out within the cooldown.
    Runs after the response, so a right and a wrong email take the same time to answer."""
    db = SessionLocal()
    try:
        now = utc_now()
        latest = db.query(AdminCode).order_by(AdminCode.id.desc()).first()
        if latest and now - latest.sent_at < timedelta(seconds=config.OTP_RESEND_COOLDOWN_SECONDS):
            return

        code = f"{secrets.randbelow(1_000_000):06d}"
        try:
            send_admin_code_email(code)
        except (smtplib.SMTPException, OSError):
            logger.exception("Couldn't send the admin login code")
            return

        # only the newest code counts, so older ones are dropped
        db.query(AdminCode).delete()
        db.add(
            AdminCode(
                code_hash=get_password_hash(code),
                sent_at=now,
                expires_at=now + timedelta(minutes=config.OTP_EXPIRE_MINUTES),
                attempts=0,
            )
        )
        db.commit()
    finally:
        db.close()


# emails a login code if this is the admin's email; answers the same either way
@router.post("/request-code", status_code=status.HTTP_202_ACCEPTED)
def request_code(data: AdminCodeRequest, background_tasks: BackgroundTasks):
    if not smtp_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email isn't set up")
    if _is_admin_email(data.email):
        background_tasks.add_task(_send_admin_code)
    return CODE_REQUESTED


# logs the admin in with the emailed code
@router.post("/verify-code", response_model=AdminToken)
def verify_code(data: AdminCodeVerify, db: Session = Depends(get_db)):
    wrong_code = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong code")
    # a wrong email gets the wrong-code answer and doesn't use up the admin's tries
    if not _is_admin_email(data.email):
        raise wrong_code

    latest = db.query(AdminCode).order_by(AdminCode.id.desc()).first()
    if not latest or not latest.code_hash or utc_now() > latest.expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired")
    if latest.attempts >= config.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many attempts")

    if not verify_password(data.code.strip(), latest.code_hash):
        latest.attempts += 1
        db.commit()
        raise wrong_code

    # a code works once
    latest.code_hash = None
    db.add(AdminLog(action="login"))
    db.commit()

    return AdminToken(
        access_token=create_admin_token(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=config.ADMIN_SESSION_MINUTES),
    )


@router.get("/session", response_model=AdminSession, dependencies=[Depends(get_admin)])
def get_session():
    """Lets the panel check its saved login is still good."""
    return AdminSession(email=config.ADMIN_EMAIL)
