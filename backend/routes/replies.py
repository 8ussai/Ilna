from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.post import Post, Reply, ReplyVote
from backend.models.user import User
from backend.routes.posts import can_see_post
from backend.schemas.post import PostVoteAction, PostVoteResult
from backend.schemas.reply import ReplyCreate, ReplyOut
from backend.services.notifications import NotificationType, notify_new_reply, sync_vote_notification
from backend.services.votes import check_vote_dir, toggle_vote

router = APIRouter()


def _map_to_reply_out(reply: Reply, votes_count: int = 0, my_vote: int = 0) -> ReplyOut:
    return ReplyOut(
        id=reply.id,
        post_id=reply.post_id,
        parent_id=reply.parent_id,
        user_id=None if reply.is_deleted else reply.user_id,
        content="" if reply.is_deleted else reply.content,
        is_deleted=reply.is_deleted,
        created_at=reply.created_at,
        votes_count=votes_count,
        my_vote=my_vote,
        author=None if reply.is_deleted else reply.author,
    )


def _get_visible_post(db: Session, post_id: int, user: User) -> Post:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Post {post_id} not found.")
    if not can_see_post(post, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This post is outside your blogs.")
    return post


def _get_reply(db: Session, reply_id: int) -> Reply:
    reply = db.query(Reply).filter(Reply.id == reply_id).first()
    if not reply:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Reply {reply_id} not found.")
    return reply


@router.get("/posts/{post_id}/replies", response_model=list[ReplyOut])
def get_replies(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The whole thread as a flat list; build the tree from parent_id. Best-voted first, then oldest."""
    _get_visible_post(db, post_id, current_user)

    votes_count = func.coalesce(func.sum(ReplyVote.vote_dir), 0)
    my_vote = func.coalesce(func.sum(case((ReplyVote.user_id == current_user.id, ReplyVote.vote_dir), else_=0)), 0)

    results = (
        db.query(Reply, votes_count.label("votes_count"), my_vote.label("my_vote"))
        .outerjoin(ReplyVote, Reply.id == ReplyVote.reply_id)
        .options(joinedload(Reply.author))
        .filter(Reply.post_id == post_id)
        .group_by(Reply.id)
        .order_by(votes_count.desc(), Reply.created_at.asc(), Reply.id.asc())
        .all()
    )

    return [_map_to_reply_out(reply, votes, mine) for reply, votes, mine in results]


@router.post("/posts/{post_id}/replies", response_model=ReplyOut, status_code=status.HTTP_201_CREATED)
def create_reply(
    post_id: int,
    reply_data: ReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_visible_post(db, post_id, current_user)

    parent = None
    if reply_data.parent_id is not None:
        parent = db.query(Reply).filter(Reply.id == reply_data.parent_id).first()
        if not parent or parent.post_id != post_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The reply you're answering isn't on this post.")
        if parent.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't reply to a deleted reply.")

    new_reply = Reply(
        post_id=post_id,
        parent_id=reply_data.parent_id,
        user_id=current_user.id,
        content=reply_data.content,
    )

    db.add(new_reply)
    db.flush()
    notify_new_reply(db, new_reply, post, parent)
    db.commit()
    db.refresh(new_reply)

    return _map_to_reply_out(new_reply)


@router.delete("/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reply(
    reply_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reply = _get_reply(db, reply_id)

    if reply.is_deleted or reply.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own replies.")

    if reply.children:
        # keep a placeholder so the answers below it stay in the thread
        reply.is_deleted = True
        reply.content = ""
        reply.votes.clear()
        # what it said is gone, so are the notifications pointing at it
        reply.notifications.clear()
    else:
        # remove the reply, then any placeholders above it that no longer hold anything
        parent = reply.parent
        db.delete(reply)
        db.flush()
        while parent is not None and parent.is_deleted:
            db.refresh(parent)
            if parent.children:
                break
            grandparent = parent.parent
            db.delete(parent)
            db.flush()
            parent = grandparent

    db.commit()


@router.post("/replies/{reply_id}/vote", response_model=PostVoteResult)
def vote_reply(
    reply_id: int,
    vote_action: PostVoteAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vote_dir = vote_action.vote_dir

    if error := check_vote_dir(vote_dir):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

    reply = _get_reply(db, reply_id)
    _get_visible_post(db, reply.post_id, current_user)

    if reply.is_deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't vote on a deleted reply.")

    existing_vote = (
        db.query(ReplyVote)
        .filter(ReplyVote.reply_id == reply_id, ReplyVote.user_id == current_user.id)
        .first()
    )

    message, my_vote = toggle_vote(
        db, existing_vote, vote_dir,
        lambda: ReplyVote(reply_id=reply_id, user_id=current_user.id, vote_dir=vote_dir),
    )
    sync_vote_notification(
        db, owner_id=reply.user_id, actor_id=current_user.id, type=NotificationType.reply_vote,
        post_id=reply.post_id, reply_id=reply_id, vote_dir=my_vote,
    )
    db.commit()

    votes_count = (
        db.query(func.coalesce(func.sum(ReplyVote.vote_dir), 0))
        .filter(ReplyVote.reply_id == reply_id)
        .scalar()
    )

    return PostVoteResult(message=message, vote_dir=my_vote, votes_count=votes_count)
