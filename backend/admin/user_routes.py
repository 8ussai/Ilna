import json
import logging
import secrets
import smtplib

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend import config
from backend.accounts.auth_routes import send_code
from backend.accounts.deletion import delete_account
from backend.accounts.models import User
from backend.admin.account import get_admin_account
from backend.admin.models import AdminLog
from backend.admin.schemas import (
    AdminUserOut,
    AdminUserPage,
    BanRequest,
    DeleteUserRequest,
    TestPassword,
    TestUserCreate,
    TestUserCreated,
)
from backend.blog.models import Post, Reply
from backend.core.dependencies import get_admin
from backend.core.email import (
    send_restored_email,
    send_suspended_email,
    smtp_configured,
)
from backend.core.security import (
    decrypt_secret,
    encrypt_secret,
    generate_password,
    get_password_hash,
)
from backend.courses.models import Course, CourseMaterial
from backend.database import get_db, utc_now
from backend.notifications.models import Notification
from backend.notifications.service import NotificationType

router = APIRouter()


logger = logging.getLogger(__name__)


# a student by id (never the hidden admin account), or 404
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

    # runs a grouped count query as {user id: total}
    def per_user(query):
        return dict(query.all())

    posts = per_user(db.query(Post.user_id, func.count(Post.id)).filter(Post.user_id.in_(ids)).group_by(Post.user_id))
    replies = per_user(
        db.query(Reply.user_id, func.count(Reply.id))
        .filter(Reply.user_id.in_(ids), Reply.is_deleted.is_(False))
        .group_by(Reply.user_id)
    )
    courses = per_user(
        db.query(Course.user_id, func.count(Course.id)).filter(Course.user_id.in_(ids)).group_by(Course.user_id)
    )
    storage = per_user(
        db.query(Course.user_id, func.coalesce(func.sum(CourseMaterial.size_bytes), 0))
        .join(CourseMaterial, CourseMaterial.course_id == Course.id)
        .filter(Course.user_id.in_(ids))
        .group_by(Course.user_id)
    )
    return [
        AdminUserOut.model_validate(user).model_copy(
            update={
                "posts_count": posts.get(user.id, 0),
                "replies_count": replies.get(user.id, 0),
                "courses_count": courses.get(user.id, 0),
                "storage_bytes": storage.get(user.id, 0),
            }
        )
        for user in users
    ]


# the Users page: search by name, username or email, filter premium or test accounts
@router.get("/users", response_model=AdminUserPage, dependencies=[Depends(get_admin)])
def list_users(
    q: str = Query("", max_length=100, description="Part of a name, username or email; empty lists everyone."),
    premium: bool = Query(False, description="Only premium students."),
    test: bool = Query(False, description="Only test accounts."),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.is_system.is_(False))
    if premium:
        query = query.filter(User.is_premium.is_(True))
    if test:
        query = query.filter(User.is_test.is_(True))
    # every word has to match somewhere, so "ahmad ali" finds Ahmad Ali
    for word in q.strip().split():
        like = f"%{word}%"
        query = query.filter(
            or_(
                User.username.ilike(like),
                User.email.ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
            )
        )
    total = query.count()
    users = query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit).all()
    return AdminUserPage(items=_with_counts(db, users), total=total)


# one student with their totals
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
        db.add(
            AdminLog(
                action="verify",
                target_type="user",
                target_id=user.id,
                details=json.dumps({"username": user.username}, ensure_ascii=False),
            )
        )
        db.commit()
    return _with_counts(db, [user])[0]


# emails an unverified student a new sign-up code
@router.post("/users/{user_id}/resend-code", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def resend_user_code(user_id: int, db: Session = Depends(get_db)):
    user = _get_student(db, user_id)
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already verified")
    if not smtp_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email isn't set up")
    # the student's own resend, cooldown included; raises 502 if the email can't be sent
    send_code(user, db)


# deletes a student's account and everything in it, once the username is typed to confirm
@router.post("/users/{user_id}/delete", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def delete_user(user_id: int, data: DeleteUserRequest, db: Session = Depends(get_db)):
    user = _get_student(db, user_id)
    if data.confirm_username.strip().lower() != user.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username doesn't match")

    details = {"username": user.username, "email": user.email, "name": f"{user.first_name} {user.last_name}"}
    details["removed"] = delete_account(db, user)
    db.add(
        AdminLog(
            action="delete_user", target_type="user", target_id=user_id, details=json.dumps(details, ensure_ascii=False)
        )
    )
    db.commit()


@router.post("/users/{user_id}/ban", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def ban_user(user_id: int, data: BanRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Bans at once: every request from the account is refused from here on, which logs the student out.
    The suspended email goes out after that."""
    user = _get_student(db, user_id)
    user.is_banned = True
    user.banned_reason = data.reason
    user.banned_at = utc_now()
    db.add(
        AdminLog(
            action="ban",
            target_type="user",
            target_id=user.id,
            details=json.dumps({"username": user.username, "reason": data.reason}, ensure_ascii=False),
        )
    )
    db.commit()
    db.refresh(user)

    # a test account has no real email
    if smtp_configured() and not user.is_test:
        background_tasks.add_task(_email_quietly, send_suspended_email, user, data.reason)
    return _with_counts(db, [user])[0]


# a test account by id, or an error for a real one
def _get_test_user(db: Session, user_id: int) -> User:
    user = _get_student(db, user_id)
    if not user.is_test:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a test account")
    return user


# records a test-account action in the admin log
def _log_test(db: Session, action: str, user: User) -> None:
    db.add(
        AdminLog(
            action=action,
            target_type="user",
            target_id=user.id,
            details=json.dumps({"username": user.username}, ensure_ascii=False),
        )
    )


def _set_test_password(user: User) -> str:
    """A new generated password; logins made with the old one end."""
    password = generate_password()
    user.hashed_password = get_password_hash(password)
    user.test_password_enc = encrypt_secret(password)
    user.password_changed_at = utc_now()
    return password


@router.post(
    "/test-users",
    response_model=TestUserCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_admin)],
)
def create_test_user(data: TestUserCreate, db: Session = Depends(get_db)):
    """Makes testuser{id}: verified, no real email, a generated password the panel can show again."""
    # placeholders until the id is known, then named after it
    placeholder = secrets.token_hex(8)
    user = User(
        username=f"pending{placeholder}",
        email=f"pending{placeholder}@{config.TEST_EMAIL_DOMAIN}",
        first_name=data.first_name,
        last_name=data.last_name,
        hashed_password="",
        country=data.country,
        university=data.university,
        college=data.college,
        major=data.major,
        is_verified=True,
        is_test=True,
        is_active=True,
    )
    db.add(user)
    db.flush()

    username = f"testuser{user.id}"
    if db.query(User).filter(User.username == username, User.id != user.id).first():
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{username} is already taken")
    user.username = username
    user.email = f"{username}@{config.TEST_EMAIL_DOMAIN}"
    password = _set_test_password(user)
    _log_test(db, "create_test_user", user)
    db.commit()
    db.refresh(user)
    return TestUserCreated(user=_with_counts(db, [user])[0], password=password)


# shows a test account's password again
@router.get("/users/{user_id}/test-password", response_model=TestPassword, dependencies=[Depends(get_admin)])
def show_test_password(user_id: int, db: Session = Depends(get_db)):
    user = _get_test_user(db, user_id)
    password = decrypt_secret(user.test_password_enc) if user.test_password_enc else None
    if password is None:
        # SECRET_KEY changed since it was saved; a new password fixes it
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Password can't be shown")
    _log_test(db, "show_test_password", user)
    db.commit()
    return TestPassword(password=password)


@router.post("/users/{user_id}/test-password", response_model=TestPassword, dependencies=[Depends(get_admin)])
def new_test_password(user_id: int, db: Session = Depends(get_db)):
    """Makes a new password; the test account is logged out everywhere."""
    user = _get_test_user(db, user_id)
    password = _set_test_password(user)
    _log_test(db, "new_test_password", user)
    db.commit()
    return TestPassword(password=password)


# turns a test account back on
@router.post("/users/{user_id}/activate", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def activate_test_user(user_id: int, db: Session = Depends(get_db)):
    user = _get_test_user(db, user_id)
    if not user.is_active:
        user.is_active = True
        _log_test(db, "activate_test_user", user)
        db.commit()
        db.refresh(user)
    return _with_counts(db, [user])[0]


@router.post("/users/{user_id}/deactivate", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def deactivate_test_user(user_id: int, db: Session = Depends(get_db)):
    """Every request from the account is refused from here on, which logs it out; its data stays."""
    user = _get_test_user(db, user_id)
    if user.is_active:
        user.is_active = False
        _log_test(db, "deactivate_test_user", user)
        db.commit()
        db.refresh(user)
    return _with_counts(db, [user])[0]


@router.post("/users/{user_id}/premium", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def grant_premium(user_id: int, db: Session = Depends(get_db)):
    """Premium lasts until it's turned off here. The student gets a notification."""
    user = _get_student(db, user_id)
    if user.is_premium:
        return _with_counts(db, [user])[0]

    user.is_premium = True
    user.premium_since = utc_now()
    db.add(
        Notification(user_id=user.id, actor_id=get_admin_account(db).id, type=NotificationType.premium_granted.value)
    )
    db.add(
        AdminLog(
            action="premium",
            target_type="user",
            target_id=user.id,
            details=json.dumps({"username": user.username}, ensure_ascii=False),
        )
    )
    db.commit()
    db.refresh(user)
    return _with_counts(db, [user])[0]


@router.post("/users/{user_id}/unpremium", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def remove_premium(user_id: int, db: Session = Depends(get_db)):
    """Back to the normal limits; files already over the normal storage limit are kept, but no more can be uploaded."""
    user = _get_student(db, user_id)
    if not user.is_premium:
        return _with_counts(db, [user])[0]

    db.add(
        AdminLog(
            action="unpremium",
            target_type="user",
            target_id=user.id,
            details=json.dumps(
                {
                    "username": user.username,
                    "premium_since": user.premium_since.isoformat() if user.premium_since else None,
                },
                ensure_ascii=False,
            ),
        )
    )
    user.is_premium = False
    user.premium_since = None
    # a custom theme color is premium-only; presets are kept
    if user.accent_color and user.accent_color.startswith("#"):
        user.accent_color = None
    db.commit()
    db.refresh(user)
    return _with_counts(db, [user])[0]


# lifts a ban and emails the student
@router.post("/users/{user_id}/unban", response_model=AdminUserOut, dependencies=[Depends(get_admin)])
def unban_user(user_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = _get_student(db, user_id)
    if not user.is_banned:
        return _with_counts(db, [user])[0]

    db.add(
        AdminLog(
            action="unban",
            target_type="user",
            target_id=user.id,
            details=json.dumps({"username": user.username, "was_banned_for": user.banned_reason}, ensure_ascii=False),
        )
    )
    user.is_banned = False
    user.banned_reason = None
    user.banned_at = None
    db.commit()
    db.refresh(user)

    if smtp_configured() and not user.is_test:
        background_tasks.add_task(_email_quietly, send_restored_email, user)
    return _with_counts(db, [user])[0]
