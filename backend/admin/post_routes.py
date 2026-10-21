import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.admin.account import get_admin_account
from backend.admin.models import AdminLog
from backend.admin.schemas import (
    AdminPostCreate,
    AdminPostDetail,
    AdminPostOut,
    AdminPostPage,
    AdminReplyOut,
    PinRequest,
    ReasonRequest,
    ReplyLookup,
)
from backend.blog.anonymity import anonymous_author, anonymous_reply_author
from backend.blog.models import (
    Post,
    PostImage,
    PostVote,
    Reply,
    ReplyVote,
    Report,
    ThreadAnonNumber,
)
from backend.blog.reply_removal import remove_reply
from backend.blog.schemas import PostAuthor, PostScope
from backend.core.catalog import locate
from backend.core.dependencies import get_admin
from backend.core.files import remove_files
from backend.database import get_db, utc_now
from backend.notifications.service import NotificationType, notify_removal

router = APIRouter()


def shown_as(db: Session, item: Post | Reply) -> Optional[PostAuthor]:
    """What everyone else sees in place of an anonymous post's or reply's author; None when it's named."""
    if not item.is_anonymous:
        return None
    if isinstance(item, Post):
        return anonymous_author()
    row = db.get(ThreadAnonNumber, (item.post_id, item.user_id))
    return anonymous_reply_author(item.post, item.user_id, row.number if row else None)


# a post as the admin's Posts page shows it
def _post_out(db: Session, post: Post, votes_count: int, replies_count: int) -> AdminPostOut:
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
        is_pinned=post.pinned_until is not None and post.pinned_until > utc_now(),
        votes_count=votes_count,
        replies_count=replies_count,
        shown_as=shown_as(db, post),
        images=post.images,
    )


# posts with their score and reply count
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
    return AdminPostPage(items=[_post_out(db, post, votes, replies) for post, votes, replies in rows], total=total)


# a post with its whole thread, for the admin
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
        post=_post_out(db, post, votes, replies_count),
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
                shown_as=None if reply.is_deleted else shown_as(db, reply),
            )
            for reply in replies
        ],
    )


# serves a post's picture to the admin
@router.get("/posts/{post_id}/images/{image_id}", response_class=FileResponse, dependencies=[Depends(get_admin)])
def get_post_image_as_admin(post_id: int, image_id: int, db: Session = Depends(get_db)):
    image = db.query(PostImage).filter(PostImage.id == image_id, PostImage.post_id == post_id).first()
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Picture not found")
    return FileResponse(image.file_path, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


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
    db.add(
        AdminLog(
            action="remove_post",
            target_type="post",
            target_id=post.id,
            details=json.dumps(
                {
                    "reason": data.reason,
                    "author": author.username,
                    "scope": post.scope,
                    "content": post.content,
                    "replies": [
                        {"id": r.id, "author": r.author.username if r.author else None, "content": r.content}
                        for r in post.replies
                        if not r.is_deleted
                    ],
                },
                ensure_ascii=False,
            ),
        )
    )

    # reports on the post or anything in its thread are settled by removing it
    reply_ids = [r.id for r in post.replies]
    db.query(Report).filter(or_(Report.post_id == post.id, Report.reply_id.in_(reply_ids))).delete(
        synchronize_session=False
    )

    notify_removal(
        db,
        recipient_id=author.id,
        admin_account_id=get_admin_account(db).id,
        type=NotificationType.post_removed,
        ref=f"P{post.id}",
        reason=data.reason,
        content=post.content,
    )
    # its replies, votes, notifications and pictures go with it (the ORM cascade); the picture files after the commit
    image_paths = [image.file_path for image in post.images]
    db.delete(post)
    db.commit()
    remove_files(image_paths)


@router.post("/replies/{reply_id}/remove", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def remove_reply_as_admin(reply_id: int, data: ReasonRequest, db: Session = Depends(get_db)):
    """Removes a reply and tells its author why. One that has answers stays as "[removed by admin]"."""
    reply = db.query(Reply).filter(Reply.id == reply_id).first()
    if not reply or reply.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reply not found")

    author = reply.author
    db.add(
        AdminLog(
            action="remove_reply",
            target_type="reply",
            target_id=reply.id,
            details=json.dumps(
                {
                    "reason": data.reason,
                    "author": author.username,
                    "post_id": reply.post_id,
                    "content": reply.content,
                },
                ensure_ascii=False,
            ),
        )
    )
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


# one of the admin's own posts, or 404
def _admin_post(db: Session, post_id: int) -> Post:
    post = db.query(Post).filter(Post.id == post_id, Post.user_id == get_admin_account(db).id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin post not found")
    return post


# when a pin of this many hours from now ends; None for not pinned
def _pin_until(hours: int | None) -> datetime | None:
    return None if hours is None else utc_now() + timedelta(hours=hours)


@router.post(
    "/posts", response_model=AdminPostOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_admin)]
)
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
    db.add(
        AdminLog(
            action="admin_post",
            target_type="post",
            target_id=post.id,
            details=json.dumps(
                {
                    "scope": data.scope.value,
                    "value": data.value,
                    "pin_hours": data.pin_hours,
                    "content": data.content,
                },
                ensure_ascii=False,
            ),
        )
    )
    db.commit()
    db.refresh(post)
    return _post_out(db, post, 0, 0)


@router.post("/posts/{post_id}/pin", response_model=AdminPostOut, dependencies=[Depends(get_admin)])
def pin_admin_post(post_id: int, data: PinRequest, db: Session = Depends(get_db)):
    """Pins an admin post for some hours from now, or unpins it (pin_hours null)."""
    post = _admin_post(db, post_id)
    post.pinned_until = _pin_until(data.pin_hours)
    db.add(
        AdminLog(
            action="pin" if data.pin_hours else "unpin",
            target_type="post",
            target_id=post.id,
            details=json.dumps({"pin_hours": data.pin_hours}),
        )
    )
    db.commit()
    votes, replies = _posts_with_counts(db).filter(Post.id == post.id).one()[1:]
    return _post_out(db, post, votes, replies)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_admin)])
def delete_admin_post(post_id: int, db: Session = Depends(get_db)):
    """Deletes one of the admin's own posts with its thread. Students' posts go through /remove instead."""
    post = _admin_post(db, post_id)
    reply_ids = [r.id for r in post.replies]
    db.query(Report).filter(or_(Report.post_id == post.id, Report.reply_id.in_(reply_ids))).delete(
        synchronize_session=False
    )
    db.add(
        AdminLog(
            action="delete_admin_post",
            target_type="post",
            target_id=post.id,
            details=json.dumps({"content": post.content}, ensure_ascii=False),
        )
    )
    db.delete(post)
    db.commit()
