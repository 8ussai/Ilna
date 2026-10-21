from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from backend.accounts.models import User
from backend.blog.anonymity import (
    number_anonymous_reply,
    public_reply_author,
    thread_anon_numbers,
)
from backend.blog.models import Post, Reply, ReplyVote
from backend.blog.post_routes import can_see_post
from backend.blog.reply_removal import remove_reply
from backend.blog.schemas import (
    AnonymitySwitch,
    PostVoteAction,
    PostVoteResult,
    ReplyCreate,
    ReplyOut,
)
from backend.blog.votes import check_vote_dir, toggle_vote
from backend.core.dependencies import get_current_user, get_full_user
from backend.database import get_db
from backend.notifications.service import (
    NotificationType,
    notify_new_reply,
    sync_vote_notification,
)

router = APIRouter()


def _map_to_reply_out(
    reply: Reply,
    post: Post,
    viewer: User,
    anon_numbers: dict[int, int],
    votes_count: int = 0,
    my_vote: int = 0,
) -> ReplyOut:
    """anon_numbers is the thread's user id -> "Anonymous N" number. An anonymous reply goes out without
    its author's id, name or username, even to the author: is_mine is how their own page knows it's theirs."""
    hidden = reply.is_deleted or reply.is_anonymous
    return ReplyOut(
        id=reply.id,
        post_id=reply.post_id,
        parent_id=reply.parent_id,
        user_id=None if hidden else reply.user_id,
        content="" if reply.is_deleted else reply.content,
        is_deleted=reply.is_deleted,
        removed_by_admin=reply.removed_by_admin,
        created_at=reply.created_at,
        votes_count=votes_count,
        my_vote=my_vote,
        author=None if reply.is_deleted else public_reply_author(reply, post, anon_numbers),
        is_anonymous=reply.is_anonymous and not reply.is_deleted,
        is_mine=not reply.is_deleted and reply.user_id == viewer.id,
        anonymity_switched=reply.anonymity_switched,
    )


# a post the user can see, or 404/403
def _get_visible_post(db: Session, post_id: int, user: User) -> Post:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Post {post_id} not found.")
    if not can_see_post(post, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This post is outside your blogs.")
    return post


# a reply by id, or 404
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
    post = _get_visible_post(db, post_id, current_user)

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

    numbers = thread_anon_numbers(db, post_id)
    return [_map_to_reply_out(reply, post, current_user, numbers, votes, mine) for reply, votes, mine in results]


# replies to a post or to another reply, and notifies their authors
@router.post("/posts/{post_id}/replies", response_model=ReplyOut, status_code=status.HTTP_201_CREATED)
def create_reply(
    post_id: int,
    reply_data: ReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
):
    post = _get_visible_post(db, post_id, current_user)

    parent = None
    if reply_data.parent_id is not None:
        parent = db.query(Reply).filter(Reply.id == reply_data.parent_id).first()
        if not parent or parent.post_id != post_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="The reply you're answering isn't on this post."
            )
        if parent.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't reply to a deleted reply.")

    new_reply = Reply(
        post_id=post_id,
        parent_id=reply_data.parent_id,
        user_id=current_user.id,
        content=reply_data.content,
        is_anonymous=reply_data.is_anonymous,
    )

    db.add(new_reply)
    db.flush()
    if new_reply.is_anonymous:
        number_anonymous_reply(db, post, current_user.id)
    notify_new_reply(db, new_reply, post, parent)
    db.commit()
    db.refresh(new_reply)

    return _map_to_reply_out(new_reply, post, current_user, thread_anon_numbers(db, post_id))


@router.patch("/replies/{reply_id}/anonymity", response_model=ReplyOut)
def switch_reply_anonymity(
    reply_id: int,
    data: AnonymitySwitch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
):
    """The author's one switch between anonymous and named, after replying."""
    reply = _get_reply(db, reply_id)
    if reply.is_deleted or reply.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only change your own replies.")
    if reply.anonymity_switched:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You can only change this once.")
    if reply.is_anonymous == data.is_anonymous:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The reply is already like that.")

    reply.is_anonymous = data.is_anonymous
    reply.anonymity_switched = True
    if data.is_anonymous:
        number_anonymous_reply(db, reply.post, current_user.id)
    db.commit()

    votes_count, my_vote = (
        db.query(
            func.coalesce(func.sum(ReplyVote.vote_dir), 0),
            func.coalesce(func.sum(case((ReplyVote.user_id == current_user.id, ReplyVote.vote_dir), else_=0)), 0),
        )
        .filter(ReplyVote.reply_id == reply_id)
        .one()
    )
    return _map_to_reply_out(
        reply, reply.post, current_user, thread_anon_numbers(db, reply.post_id), votes_count, my_vote
    )


# deletes the user's own reply; one with answers stays as "[deleted]"
@router.delete("/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reply(
    reply_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reply = _get_reply(db, reply_id)

    if reply.is_deleted or reply.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own replies.")

    remove_reply(db, reply)
    db.commit()


# upvotes or downvotes a reply; the same vote again takes it back
@router.post("/replies/{reply_id}/vote", response_model=PostVoteResult)
def vote_reply(
    reply_id: int,
    vote_action: PostVoteAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
):
    vote_dir = vote_action.vote_dir

    if error := check_vote_dir(vote_dir):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

    reply = _get_reply(db, reply_id)
    _get_visible_post(db, reply.post_id, current_user)

    if reply.is_deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't vote on a deleted reply.")

    existing_vote = (
        db.query(ReplyVote).filter(ReplyVote.reply_id == reply_id, ReplyVote.user_id == current_user.id).first()
    )

    message, my_vote = toggle_vote(
        db,
        existing_vote,
        vote_dir,
        lambda: ReplyVote(reply_id=reply_id, user_id=current_user.id, vote_dir=vote_dir),
    )
    sync_vote_notification(
        db,
        owner_id=reply.user_id,
        actor_id=current_user.id,
        type=NotificationType.reply_vote,
        post_id=reply.post_id,
        reply_id=reply_id,
        vote_dir=my_vote,
    )
    db.commit()

    votes_count = (
        db.query(func.coalesce(func.sum(ReplyVote.vote_dir), 0)).filter(ReplyVote.reply_id == reply_id).scalar()
    )

    return PostVoteResult(message=message, vote_dir=my_vote, votes_count=votes_count)
