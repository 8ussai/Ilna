import json
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from backend import backendConfig
from backend.core.apiDependencies import get_admin
from backend.core.security import create_admin_token, get_password_hash, verify_password
from backend.database import SessionLocal, get_db
from backend.models.admin import AdminCode, AdminLog, Report
from backend.models.contact import ContactMessage
from backend.models.course import Course, CourseMaterial
from backend.models.notification import Notification
from backend.models.post import Post, PostVote, Reply, ReplyVote
from backend.models.user import User
from backend.routes.auth import _send_code as send_code
from backend.schemas.post import PostScope
from backend.schemas.admin import (
    AdminCodeRequest,
    AdminCodeVerify,
    AdminContactOut,
    AdminContactPage,
    AdminLogOut,
    AdminLogPage,
    AdminMessageCreate,
    AdminPostDetail,
    AdminPostCreate,
    AdminPostOut,
    AdminPostPage,
    AdminReplyOut,
    AdminReportEntry,
    AdminReportGroup,
    AdminSession,
    AdminToken,
    AdminUserOut,
    AdminUserPage,
    BanRequest,
    DeleteUserRequest,
    HandledRequest,
    MessageAudience,
    OpenCount,
    PinRequest,
    RecipientCount,
    ReasonRequest,
    ReplyLookup,
    ReportTarget,
)
from backend.services.admin_account import get_admin_account
from backend.services.notifications import NotificationType, notify_removal
from backend.services.reply_removal import remove_reply
from backend.services.account_deletion import delete_account
from backend.services.catalog import locate
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



def _post_out(post: Post, votes_count: int, replies_count: int) -> AdminPostOut:
    return AdminPostOut(
        id=post.id,
        content=post.content,
        scope=post.scope,
        university=post.university,
        college=post.college,
        major=post.major,
        created_at=post.created_at,
        author=post.author,
        is_admin_post=post.author.is_system,
        pinned_until=post.pinned_until,
        is_pinned=post.pinned_until is not None and post.pinned_until > _now(),
        votes_count=votes_count,
        replies_count=replies_count,
    )


def _posts_with_counts(db: Session):
    votes = (
        db.query(func.coalesce(func.sum(PostVote.vote_dir), 0))
        .filter(PostVote.post_id == Post.id)
        .correlate(Post)
        .scalar_subquery()
    )
    replies = (
        db.query(func.count(Reply.id))
        .filter(Reply.post_id == Post.id, Reply.is_deleted.is_(False))
        .correlate(Post)
        .scalar_subquery()
    )
    return db.query(Post, votes, replies)


@router.get("/posts", response_model=AdminPostPage, dependencies=[Depends(get_admin)])
def list_posts(
    scope: PostScope | None = Query(None, description="One blog; leave empty for all of them."),
    admin_only: bool = Query(False, description="Only the admin's own posts."),
    q: str = Query("", max_length=100, description="Words the post has to contain."),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Posts from every university, newest first."""
    query = db.query(Post)
    if admin_only:
        query = query.filter(Post.user_id == get_admin_account(db).id)
    if scope is not None:
        query = query.filter(Post.scope == scope.value)
    for word in q.strip().split():
        query = query.filter(Post.content.ilike(f"%{word}%"))
    total = query.count()

    rows = (
        _posts_with_counts(db)
        .filter(Post.id.in_(query.with_entities(Post.id)))
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AdminPostPage(items=[_post_out(post, votes, replies) for post, votes, replies in rows], total=total)


@router.get("/posts/{post_id}", response_model=AdminPostDetail, dependencies=[Depends(get_admin)])
def get_post_detail(post_id: int, db: Session = Depends(get_db)):
    row = _posts_with_counts(db).filter(Post.id == post_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    post, votes, replies_count = row

    reply_votes = dict(
        db.query(ReplyVote.reply_id, func.sum(ReplyVote.vote_dir))
        .join(Reply, Reply.id == ReplyVote.reply_id)
        .filter(Reply.post_id == post_id)
        .group_by(ReplyVote.reply_id)
        .all()
    )
    replies = db.query(Reply).filter(Reply.post_id == post_id).order_by(Reply.id).all()
    return AdminPostDetail(
        post=_post_out(post, votes, replies_count),
        replies=[
            AdminReplyOut(
                id=reply.id,
                parent_id=reply.parent_id,
                content="" if reply.is_deleted else reply.content,
                is_deleted=reply.is_deleted,
                removed_by_admin=reply.removed_by_admin,
                author=None if reply.is_deleted else reply.author,
                created_at=reply.created_at,
                votes_count=reply_votes.get(reply.id, 0),
            )
            for reply in replies
        ],
    )


@router.get("/replies/{reply_id}", response_model=ReplyLookup, dependencies=[Depends(get_admin)])
def find_reply(reply_id: int, db: Session = Depends(get_db)):
    """For jumping to #R17: which post it's on."""
    reply = db.query(Reply).filter(Reply.id == reply_id).first()
    if not reply:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reply not found")
    return ReplyLookup(reply_id=reply.id, post_id=reply.post_id)


@router.post("/posts/{post_id}/remove", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def remove_post(post_id: int, data: ReasonRequest, db: Session = Depends(get_db)):
    """Removes the post with its whole thread, and tells the author why."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    author = post.author
    db.add(AdminLog(action="remove_post", target_type="post", target_id=post.id, details=json.dumps({
        "reason": data.reason,
        "author": author.username,
        "scope": post.scope,
        "content": post.content,
        "replies": [
            {"id": r.id, "author": r.author.username if r.author else None, "content": r.content}
            for r in post.replies if not r.is_deleted
        ],
    }, ensure_ascii=False)))

    # reports on the post or anything in its thread are settled by removing it
    reply_ids = [r.id for r in post.replies]
    db.query(Report).filter(or_(Report.post_id == post.id, Report.reply_id.in_(reply_ids))).delete(synchronize_session=False)

    notify_removal(
        db,
        recipient_id=author.id,
        admin_account_id=get_admin_account(db).id,
        type=NotificationType.post_removed,
        ref=f"P{post.id}",
        reason=data.reason,
        content=post.content,
    )
    # its replies, votes and notifications go with it (the ORM cascade)
    db.delete(post)
    db.commit()


@router.post("/replies/{reply_id}/remove", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def remove_reply_as_admin(reply_id: int, data: ReasonRequest, db: Session = Depends(get_db)):
    """Removes a reply and tells its author why. One that has answers stays as "[removed by admin]"."""
    reply = db.query(Reply).filter(Reply.id == reply_id).first()
    if not reply or reply.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reply not found")

    author = reply.author
    db.add(AdminLog(action="remove_reply", target_type="reply", target_id=reply.id, details=json.dumps({
        "reason": data.reason,
        "author": author.username,
        "post_id": reply.post_id,
        "content": reply.content,
    }, ensure_ascii=False)))
    db.query(Report).filter(Report.reply_id == reply.id).delete(synchronize_session=False)

    notify_removal(
        db,
        recipient_id=author.id,
        admin_account_id=get_admin_account(db).id,
        type=NotificationType.reply_removed,
        ref=f"R{reply.id}",
        reason=data.reason,
        content=reply.content,
        post_id=reply.post_id,
    )
    remove_reply(db, reply, by_admin=True)
    db.commit()



def _open_reports(db: Session) -> list[Report]:
    return (
        db.query(Report)
        .options(joinedload(Report.reporter), joinedload(Report.post), joinedload(Report.reply))
        .filter(Report.status == "open")
        .order_by(Report.created_at.desc(), Report.id.desc())
        .all()
    )


@router.get("/reports", response_model=list[AdminReportGroup], dependencies=[Depends(get_admin)])
def list_reports(db: Session = Depends(get_db)):
    """Open reports, one row per reported post or reply, most reported first."""
    groups: dict[tuple[str, int], AdminReportGroup] = {}
    for report in _open_reports(db):
        if report.post is not None:
            key, post, item = ("post", report.post_id), report.post, report.post
        elif report.reply is not None and not report.reply.is_deleted:
            key, post, item = ("reply", report.reply_id), report.reply.post, report.reply
        else:
            # the content is already gone; nothing to act on
            continue

        entry = AdminReportEntry(reason=report.reason, note=report.note, reporter=report.reporter, created_at=report.created_at)
        group = groups.get(key)
        if group is None:
            groups[key] = AdminReportGroup(
                target_type=key[0],
                target_id=key[1],
                post_id=post.id,
                content=item.content,
                author=item.author,
                scope=post.scope,
                university=post.university,
                college=post.college,
                major=post.major,
                created_at=item.created_at,
                reports_count=1,
                latest_at=report.created_at,
                reports=[entry],
            )
        else:
            group.reports_count += 1
            group.reports.append(entry)

    return sorted(groups.values(), key=lambda g: (g.reports_count, g.latest_at), reverse=True)


@router.get("/reports/count", response_model=OpenCount, dependencies=[Depends(get_admin)])
def count_reports(db: Session = Depends(get_db)):
    """How many posts and replies are waiting, for the tab's badge."""
    return OpenCount(count=len(list_reports(db)))


@router.post("/reports/dismiss", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def dismiss_reports(data: ReportTarget, db: Session = Depends(get_db)):
    """Closes the open reports on one item and leaves the content up. Nobody is notified."""
    column = Report.post_id if data.target_type == "post" else Report.reply_id
    reports = db.query(Report).filter(column == data.target_id, Report.status == "open").all()
    if not reports:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No open reports on that")

    now = _now()
    for report in reports:
        report.status = "dismissed"
        report.resolved_at = now
    db.add(AdminLog(action="dismiss_reports", target_type=data.target_type, target_id=data.target_id,
                    details=json.dumps({"reports": len(reports), "reasons": sorted({r.reason for r in reports})})))
    db.commit()



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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "count_changed", "count": len(recipient_ids)})

    admin_account_id = get_admin_account(db).id
    db.add_all([
        Notification(user_id=user_id, actor_id=admin_account_id, type=NotificationType.admin_message.value, message=data.message)
        for user_id in recipient_ids
    ])
    db.add(AdminLog(action="message", target_type="user" if data.target == "user" else None,
                    target_id=data.user_id if data.target == "user" else None,
                    details=json.dumps({"to": data.target, "value": data.value, "user_id": data.user_id,
                                        "recipients": len(recipient_ids), "message": data.message}, ensure_ascii=False)))
    db.commit()
    return RecipientCount(count=len(recipient_ids))



def _admin_post(db: Session, post_id: int) -> Post:
    post = db.query(Post).filter(Post.id == post_id, Post.user_id == get_admin_account(db).id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin post not found")
    return post


def _pin_until(hours: int | None) -> datetime | None:
    return None if hours is None else _now() + timedelta(hours=hours)


@router.post("/posts", response_model=AdminPostOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_admin)])
def create_admin_post(data: AdminPostCreate, db: Session = Depends(get_db)):
    """A post from Ilna Admin in any blog: general, or one university's, college's or major's."""
    if data.scope == PostScope.general:
        place = {"university": "", "college": "", "major": ""}
    else:
        place = locate(data.scope.value, data.value or "")
        if place is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown {data.scope.value}")

    post = Post(
        user_id=get_admin_account(db).id,
        content=data.content,
        scope=data.scope.value,
        pinned_until=_pin_until(data.pin_hours),
        **place,
    )
    db.add(post)
    db.flush()
    db.add(AdminLog(action="admin_post", target_type="post", target_id=post.id, details=json.dumps({
        "scope": data.scope.value, "value": data.value, "pin_hours": data.pin_hours, "content": data.content,
    }, ensure_ascii=False)))
    db.commit()
    db.refresh(post)
    return _post_out(post, 0, 0)


@router.post("/posts/{post_id}/pin", response_model=AdminPostOut, dependencies=[Depends(get_admin)])
def pin_admin_post(post_id: int, data: PinRequest, db: Session = Depends(get_db)):
    """Pins an admin post for some hours from now, or unpins it (pin_hours null)."""
    post = _admin_post(db, post_id)
    post.pinned_until = _pin_until(data.pin_hours)
    db.add(AdminLog(action="pin" if data.pin_hours else "unpin", target_type="post", target_id=post.id,
                    details=json.dumps({"pin_hours": data.pin_hours})))
    db.commit()
    votes, replies = _posts_with_counts(db).filter(Post.id == post.id).one()[1:]
    return _post_out(post, votes, replies)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def delete_admin_post(post_id: int, db: Session = Depends(get_db)):
    """Deletes one of the admin's own posts with its thread. Students' posts go through /remove instead."""
    post = _admin_post(db, post_id)
    reply_ids = [r.id for r in post.replies]
    db.query(Report).filter(or_(Report.post_id == post.id, Report.reply_id.in_(reply_ids))).delete(synchronize_session=False)
    db.add(AdminLog(action="delete_admin_post", target_type="post", target_id=post.id,
                    details=json.dumps({"content": post.content}, ensure_ascii=False)))
    db.delete(post)
    db.commit()



@router.get("/contact", response_model=AdminContactPage, dependencies=[Depends(get_admin)])
def list_contact_messages(
    status_filter: str = Query("open", alias="status", pattern="^(open|handled|all)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """"Contact us" messages, newest first. They were also emailed to CONTACT_EMAIL when sent."""
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


@router.post("/contact/{message_id}/handled", response_model=AdminContactOut, dependencies=[Depends(get_admin)])
def mark_contact_handled(message_id: int, data: HandledRequest, db: Session = Depends(get_db)):
    message = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    message.handled_at = _now() if data.handled else None
    db.commit()
    db.refresh(message)
    return message


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
