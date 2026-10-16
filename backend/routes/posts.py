from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import case, func, select

from backend.schemas.post import PostCreate, PostOut, PostScope, PostSort, PostVoteAction, PostVoteResult
from backend.database import get_db
from backend.models.user import User
from backend.models.post import Post, PostVote, Reply
from backend.core.apiDependencies import get_current_user
from backend.services.notifications import NotificationType, sync_vote_notification
from backend.services.votes import check_vote_dir, toggle_vote


router = APIRouter()

# in the hot ranking a reply counts as half an upvote
HOT_REPLY_WEIGHT = 0.5


def _replies_count_subquery():
    return (
        select(func.count(Reply.id))
        .where(Reply.post_id == Post.id, Reply.is_deleted.is_(False))
        .correlate(Post)
        .scalar_subquery()
    )


def _map_to_post_out(post: Post, votes_count: int, my_vote: int = 0, replies_count: int = 0) -> PostOut:
    return PostOut(
        id=post.id,
        user_id=post.user_id,
        content=post.content,
        scope=post.scope,
        university=post.university,
        college=post.college,
        major=post.major,
        created_at=post.created_at,
        updated_at=post.updated_at,
        votes_count=votes_count,
        my_vote=my_vote,
        replies_count=replies_count,
        author=post.author,
        is_admin_post=post.author.is_system,
        is_pinned=post.pinned_until is not None and post.pinned_until > _utc_now(),
    )


def _utc_now() -> datetime:
    # pinned_until is stored in UTC without an offset
    return datetime.now(timezone.utc).replace(tzinfo=None)


def can_see_post(post: Post, user: User) -> bool:
    if post.scope == PostScope.general.value:
        return True
    return getattr(post, post.scope) == getattr(user, post.scope)


def _scope_filter(query, scope: PostScope, user: User):
    """Each scope is its own blog; scoped blogs only show posts from the user's own university/college/major."""
    query = query.filter(Post.scope == scope.value)

    if scope == PostScope.university:
        query = query.filter(Post.university == user.university)
    elif scope == PostScope.college:
        query = query.filter(Post.college == user.college)
    elif scope == PostScope.major:
        query = query.filter(Post.major == user.major)

    return query


def _posts_with_counts(db: Session, user: User):
    """Posts with their score, the user's vote and reply count; returns the column expressions too for sorting.
    Add .group_by(Post.id) after filtering."""
    votes_count = func.coalesce(func.sum(PostVote.vote_dir), 0)
    my_vote = func.coalesce(func.sum(case((PostVote.user_id == user.id, PostVote.vote_dir), else_=0)), 0)
    replies_count = _replies_count_subquery()

    query = db.query(
        Post,
        votes_count.label('votes_count'),
        my_vote.label('my_vote'),
        replies_count.label('replies_count'),
    ).outerjoin(PostVote, Post.id == PostVote.post_id).options(joinedload(Post.author))

    return query, votes_count, replies_count


@router.post("/", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def create_post(
    post_data: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_post = Post(
        user_id=current_user.id,
        content=post_data.content,
        scope=post_data.scope.value,
        university=current_user.university,
        college=current_user.college,
        major=current_user.major,
    )

    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    return _map_to_post_out(new_post, 0)


@router.get("/", response_model=list[PostOut])
def get_posts(
    scope: PostScope = Query(..., description="Which blog to read: general, university, college or major."),
    sort: PostSort = Query(default=PostSort.hot, description="hot (score weighed by age), new, or top (highest score)."),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query, votes_count, replies_count = _posts_with_counts(db, current_user)
    query = _scope_filter(query, scope, current_user).group_by(Post.id)

    # a pinned admin post stays on top until its time runs out, whatever the sort
    query = query.order_by(case((Post.pinned_until > _utc_now(), 0), else_=1))
    newest = (Post.created_at.desc(), Post.id.desc())
    if sort == PostSort.new:
        query = query.order_by(*newest)
    elif sort == PostSort.top:
        query = query.order_by(votes_count.desc(), *newest)
    else:
        # Hacker News style: (score + 1) / (age in hours + 2) ^ 1.5, where replies add to the score
        # the +1 lets fresh 0-vote posts outrank old posts instead of sitting at 0 forever
        age_hours = (func.julianday('now') - func.julianday(Post.created_at)) * 24
        engagement = votes_count + replies_count * HOT_REPLY_WEIGHT
        hot_score = (engagement + 1.0) / func.power(age_hours + 2, 1.5)
        query = query.order_by(hot_score.desc(), *newest)

    results = query.offset(offset).limit(limit).all()

    return [_map_to_post_out(post, votes, mine, replies) for post, votes, mine, replies in results]


@router.get("/{post_id}", response_model=PostOut)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query, _, _ = _posts_with_counts(db, current_user)
    result = query.filter(Post.id == post_id).group_by(Post.id).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post {post_id} not found.",
        )

    post, votes, mine, replies = result
    if not can_see_post(post, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This post is outside your blogs.",
        )

    return _map_to_post_out(post, votes, mine, replies)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post {post_id} not found.",
        )

    if post.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own posts.",
        )

    db.delete(post)
    db.commit()


@router.post("/{post_id}/vote", response_model=PostVoteResult, status_code=status.HTTP_200_OK)
def vote_post(
    post_id: int,
    vote_action: PostVoteAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vote_dir = vote_action.vote_dir

    if error := check_vote_dir(vote_dir):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

    # make sure the post exists
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post {post_id} not found.",
        )

    # same rule as reading: you can only vote in blogs you can see
    if not can_see_post(post, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can't vote on posts outside your blogs.",
        )

    existing_vote = (
        db.query(PostVote)
        .filter(PostVote.post_id == post_id, PostVote.user_id == current_user.id)
        .first()
    )

    message, my_vote = toggle_vote(
        db, existing_vote, vote_dir,
        lambda: PostVote(post_id=post_id, user_id=current_user.id, vote_dir=vote_dir),
    )
    sync_vote_notification(
        db, owner_id=post.user_id, actor_id=current_user.id, type=NotificationType.post_vote,
        post_id=post_id, reply_id=None, vote_dir=my_vote,
    )
    db.commit()

    votes_count = (
        db.query(func.coalesce(func.sum(PostVote.vote_dir), 0))
        .filter(PostVote.post_id == post_id)
        .scalar()
    )

    return PostVoteResult(message=message, vote_dir=my_vote, votes_count=votes_count)