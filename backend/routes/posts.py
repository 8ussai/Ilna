from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import case, func

from backend.schemas.post import PostCreate, PostOut, PostScope, PostSort, PostVoteAction, PostVoteResult
from backend.database import get_db
from backend.models.user import User
from backend.models.post import Post, PostVote
from backend.core.apiDependencies import get_current_user


router = APIRouter()


def _map_to_post_out(post: Post, votes_count: int, my_vote: int = 0) -> PostOut:
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
        author=post.author,
    )


def _can_see(post: Post, user: User) -> bool:
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
    votes_count = func.coalesce(func.sum(PostVote.vote_dir), 0)
    my_vote = func.coalesce(func.sum(case((PostVote.user_id == current_user.id, PostVote.vote_dir), else_=0)), 0)

    query = db.query(
        Post,
        votes_count.label('votes_count'),
        my_vote.label('my_vote'),
    ).outerjoin(PostVote, Post.id == PostVote.post_id).options(joinedload(Post.author))

    query = _scope_filter(query, scope, current_user).group_by(Post.id)

    newest = (Post.created_at.desc(), Post.id.desc())
    if sort == PostSort.new:
        query = query.order_by(*newest)
    elif sort == PostSort.top:
        query = query.order_by(votes_count.desc(), *newest)
    else:
        # Hacker News style: (score + 1) / (age in hours + 2) ^ 1.5
        # the +1 lets fresh 0-vote posts outrank old posts instead of sitting at 0 forever
        age_hours = (func.julianday('now') - func.julianday(Post.created_at)) * 24
        hot_score = (votes_count + 1.0) / func.power(age_hours + 2, 1.5)
        query = query.order_by(hot_score.desc(), *newest)

    results = query.offset(offset).limit(limit).all()

    return [_map_to_post_out(post, votes, mine) for post, votes, mine in results]


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

    if vote_dir not in (1, -1):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="vote_dir must be 1 (upvote) or -1 (downvote).",
        )

    # make sure the post exists
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post {post_id} not found.",
        )

    # same rule as reading: you can only vote in blogs you can see
    if not _can_see(post, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can't vote on posts outside your blogs.",
        )

    existing_vote = (
        db.query(PostVote)
        .filter(PostVote.post_id == post_id, PostVote.user_id == current_user.id)
        .first()
    )

    if existing_vote is None:
        db.add(PostVote(post_id=post_id, user_id=current_user.id, vote_dir=vote_dir))
        message, my_vote = "Vote added.", vote_dir
    elif existing_vote.vote_dir == vote_dir:
        db.delete(existing_vote)
        message, my_vote = "Vote removed.", 0
    else:
        existing_vote.vote_dir = vote_dir
        message, my_vote = "Vote updated.", vote_dir

    db.commit()

    votes_count = (
        db.query(func.coalesce(func.sum(PostVote.vote_dir), 0))
        .filter(PostVote.post_id == post_id)
        .scalar()
    )

    return PostVoteResult(message=message, vote_dir=my_vote, votes_count=votes_count)