import json
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend import backendConfig
from backend.core.apiDependencies import get_admin
from backend.core.security import create_admin_token, get_password_hash, verify_password
from backend.database import SessionLocal, get_db
from backend.models.admin import AdminCode, AdminLog
from backend.models.course import Course, CourseMaterial
from backend.models.post import Post, Reply
from backend.models.user import User
from backend.routes.auth import _send_code as send_code
from backend.schemas.admin import (
    AdminCodeRequest,
    AdminCodeVerify,
    AdminSession,
    AdminToken,
    AdminUserOut,
    AdminUserPage,
    BanRequest,
    DeleteUserRequest,
)
from backend.services.account_deletion import delete_account
from backend.services.email import send_admin_code_email, send_restored_email, send_suspended_email, smtp_configured

router = APIRouter()
logger = logging.getLogger(__name__)

# the same reply whether or not the email is the admin's, so the form can't be used to find it out
CODE_REQUESTED = {"detail": "If that is the admin email, a code was sent."}


def _now() -> datetime:
    # admin_codes times are stored in UTC without an offset, like the users.otp_* times
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_admin_email(email: str) -> bool:
    return bool(backendConfig.ADMIN_EMAIL) and secrets.compare_digest(
        email.strip().lower().encode(), backendConfig.ADMIN_EMAIL.encode()
    )


def _send_admin_code() -> None:
    """Makes and emails a new code unless one went out within the cooldown.
    Runs after the response, so a right and a wrong email take the same time to answer."""
    db = SessionLocal()
    try:
        now = _now()
        latest = db.query(AdminCode).order_by(AdminCode.id.desc()).first()
        if latest and now - latest.sent_at < timedelta(seconds=backendConfig.OTP_RESEND_COOLDOWN_SECONDS):
            return

        code = f"{secrets.randbelow(1_000_000):06d}"
        try:
            send_admin_code_email(code)
        except (smtplib.SMTPException, OSError):
            logger.exception("Couldn't send the admin login code")
            return

        # only the newest code counts, so older ones are dropped
        db.query(AdminCode).delete()
        db.add(AdminCode(
            code_hash=get_password_hash(code),
            sent_at=now,
            expires_at=now + timedelta(minutes=backendConfig.OTP_EXPIRE_MINUTES),
            attempts=0,
        ))
        db.commit()
    finally:
        db.close()


@router.post("/request-code", status_code=status.HTTP_202_ACCEPTED)
def request_code(data: AdminCodeRequest, background_tasks: BackgroundTasks):
    if not smtp_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email isn't set up")
    if _is_admin_email(data.email):
        background_tasks.add_task(_send_admin_code)
    return CODE_REQUESTED


@router.post("/verify-code", response_model=AdminToken)
def verify_code(data: AdminCodeVerify, db: Session = Depends(get_db)):
    wrong_code = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong code")
    # a wrong email gets the wrong-code answer and doesn't use up the admin's tries
    if not _is_admin_email(data.email):
        raise wrong_code

    latest = db.query(AdminCode).order_by(AdminCode.id.desc()).first()
    if not latest or not latest.code_hash or _now() > latest.expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired")
    if latest.attempts >= backendConfig.OTP_MAX_ATTEMPTS:
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
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=backendConfig.ADMIN_SESSION_MINUTES),
    )


@router.get("/session", response_model=AdminSession, dependencies=[Depends(get_admin)])
def get_session():
    """Lets the panel check its saved login is still good."""
    return AdminSession(email=backendConfig.ADMIN_EMAIL)


def _get_student(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id, User.is_system.is_(False)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _email_quietly(send, *args) -> None:
    """Runs after the response; a failed email is logged, and the ban or unban still stands."""
    try:
        send(*args)
    except (smtplib.SMTPException, OSError):
        logger.exception("Couldn't send %s", send.__name__)


def _with_counts(db: Session, users: list[User]) -> list[AdminUserOut]:
    """Adds post, reply, course and storage totals, with one query each for the whole page."""
    ids = [user.id for user in users]
    if not ids:
        return []

    def per_user(query):
        return dict(query.all())

    posts = per_user(db.query(Post.user_id, func.count(Post.id)).filter(Post.user_id.in_(ids)).group_by(Post.user_id))
    replies = per_user(
        db.query(Reply.user_id, func.count(Reply.id))
        .filter(Reply.user_id.in_(ids), Reply.is_deleted.is_(False))
        .group_by(Reply.user_id)
    )
    courses = per_user(db.query(Course.user_id, func.count(Course.id)).filter(Course.user_id.in_(ids)).group_by(Course.user_id))
    storage = per_user(
        db.query(Course.user_id, func.coalesce(func.sum(CourseMaterial.size_bytes), 0))
        .join(CourseMaterial, CourseMaterial.course_id == Course.id)
        .filter(Course.user_id.in_(ids))
        .group_by(Course.user_id)
    )
    return [
        AdminUserOut.model_validate(user).model_copy(update={
            "posts_count": posts.get(user.id, 0),
            "replies_count": replies.get(user.id, 0),
            "courses_count": courses.get(user.id, 0),
            "storage_bytes": storage.get(user.id, 0),
        })
        for user in users
    ]


@router.get("/users", response_model=AdminUserPage, dependencies=[Depends(get_admin)])
def list_users(
    q: str = Query("", max_length=100, description="Part of a name, username or email; empty lists everyone."),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.is_system.is_(False))
    # every word has to match somewhere, so "ahmad ali" finds Ahmad Ali
    for word in q.strip().split():
        like = f"%{word}%"
        query = query.filter(or_(
            User.username.ilike(like), User.email.ilike(like), User.first_name.ilike(like), User.last_name.ilike(like)
        ))
    total = query.count()
    users = query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit).all()
    return AdminUserPage(items=_with_counts(db, users), total=total)


@router.get("/users/{user_id}", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def get_user(user_id: int, db: Session = Depends(get_db)):
    return _with_counts(db, [_get_student(db, user_id)])[0]


@router.post("/users/{user_id}/verify", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def verify_user(user_id: int, db: Session = Depends(get_db)):
    """For a student who never got their sign-up code."""
    user = _get_student(db, user_id)
    if not user.is_verified:
        user.is_verified = True
        user.otp_hash = None
        user.otp_sent_at = None
        user.otp_expires_at = None
        user.otp_attempts = 0
        db.add(AdminLog(action="verify", target_type="user", target_id=user.id,
                        details=json.dumps({"username": user.username}, ensure_ascii=False)))
        db.commit()
    return _with_counts(db, [user])[0]


@router.post("/users/{user_id}/resend-code", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def resend_user_code(user_id: int, db: Session = Depends(get_db)):
    user = _get_student(db, user_id)
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already verified")
    if not smtp_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email isn't set up")
    # the student's own resend, cooldown included; raises 502 if the email can't be sent
    send_code(user, db)


@router.post("/users/{user_id}/delete", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def delete_user(user_id: int, data: DeleteUserRequest, db: Session = Depends(get_db)):
    user = _get_student(db, user_id)
    if data.confirm_username.strip().lower() != user.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username doesn't match")

    details = {"username": user.username, "email": user.email, "name": f"{user.first_name} {user.last_name}"}
    details["removed"] = delete_account(db, user)
    db.add(AdminLog(action="delete_user", target_type="user", target_id=user_id,
                    details=json.dumps(details, ensure_ascii=False)))
    db.commit()


@router.post("/users/{user_id}/ban", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def ban_user(user_id: int, data: BanRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Bans at once: every request from the account is refused from here on, which logs the student out.
    The suspended email goes out after that."""
    user = _get_student(db, user_id)
    user.is_banned = True
    user.banned_reason = data.reason
    user.banned_at = _now()
    db.add(AdminLog(action="ban", target_type="user", target_id=user.id,
                    details=json.dumps({"username": user.username, "reason": data.reason}, ensure_ascii=False)))
    db.commit()
    db.refresh(user)

    if smtp_configured():
        background_tasks.add_task(_email_quietly, send_suspended_email, user, data.reason)
    return _with_counts(db, [user])[0]


@router.post("/users/{user_id}/unban", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def unban_user(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = _get_student(db, user_id)
    if not user.is_banned:
        return _with_counts(db, [user])[0]

    db.add(AdminLog(action="unban", target_type="user", target_id=user.id,
                    details=json.dumps({"username": user.username, "was_banned_for": user.banned_reason}, ensure_ascii=False)))
    user.is_banned = False
    user.banned_reason = None
    user.banned_at = None
    db.commit()
    db.refresh(user)

    if smtp_configured():
        background_tasks.add_task(_email_quietly, send_restored_email, user)
    return _with_counts(db, [user])[0]
