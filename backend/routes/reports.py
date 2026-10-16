from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.backendConfig import REPORTS_PER_HOUR
from backend.core.apiDependencies import get_current_user
from backend.database import get_db, utc_now
from backend.models.admin import Report
from backend.models.post import Post, Reply
from backend.models.user import User
from backend.routes.posts import can_see_post
from backend.schemas.report import ReportCreate

router = APIRouter()


def _check_can_report(db: Session, user: User, post: Post, author: User | None) -> None:
    if not can_see_post(post, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This post is outside your blogs.")
    if author is not None and author.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't report your own post or reply.")
    if author is not None and author.is_system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin posts can't be reported.")

    # created_at is stored in UTC without an offset, so compare against a naive UTC time
    an_hour_ago = utc_now() - timedelta(hours=1)
    made_last_hour = (
        db.query(func.count(Report.id))
        .filter(Report.reporter_id == user.id, Report.created_at > an_hour_ago)
        .scalar()
    )
    if made_last_hour >= REPORTS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've sent too many reports. Please try again later.",
        )


def _already_reported() -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already reported")


def _save(db: Session, report: Report) -> None:
    # a double click can get past the check above; the unique constraint catches it
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _already_reported()


@router.post("/posts/{post_id}/report", status_code=status.HTTP_201_CREATED)
def report_post(
    post_id: int,
    data: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Flags a post for the admin. The author is never told who reported it."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Post {post_id} not found.")
    _check_can_report(db, current_user, post, post.author)
    if db.query(Report).filter(Report.reporter_id == current_user.id, Report.post_id == post.id).first():
        raise _already_reported()

    _save(db, Report(reporter_id=current_user.id, post_id=post.id, reason=data.reason.value, note=data.note))
    return {"detail": "Reported"}


@router.post("/replies/{reply_id}/report", status_code=status.HTTP_201_CREATED)
def report_reply(
    reply_id: int,
    data: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reply = db.query(Reply).filter(Reply.id == reply_id).first()
    if not reply or reply.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Reply {reply_id} not found.")
    _check_can_report(db, current_user, reply.post, reply.author)
    if db.query(Report).filter(Report.reporter_id == current_user.id, Report.reply_id == reply.id).first():
        raise _already_reported()

    _save(db, Report(reporter_id=current_user.id, reply_id=reply.id, reason=data.reason.value, note=data.note))
    return {"detail": "Reported"}
