from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import case, func, select

from backend.backendConfig import HOT_REPLY_WEIGHT, MAX_POST_IMAGES
from backend.schemas.post import AnonymitySwitch, PostCreate, PostOut, PostScope, PostSort, PostVoteAction, PostVoteResult
from backend.database import get_db, utc_now
from backend.models.user import User
from backend.models.post import Post, PostImage, PostVote, Reply
from backend.core.apiDependencies import get_current_user, get_full_user
from backend.services.anonymity import number_post_author_if_needed, public_post_author
from backend.services.notifications import NotificationType, sync_vote_notification
from backend.services.post_images import ImageRejected, process_image, read_upload, remove_image_files, save_image
from backend.services.storage import storage_used
from backend.services.usage import storage_limit
from backend.services.votes import check_vote_dir, toggle_vote


router = APIRouter()


def _replies_count_subquery():
    return (
        select(func.count(Reply.id))
        .where(Reply.post_id == Post.id, Reply.is_deleted.is_(False))
        .correlate(Post)
        .scalar_subquery()
    )


def _map_to_post_out(
    post: Post,
    viewer: User,
    votes_count: int,
    my_vote: int = 0,
    replies_count: int = 0,
) -> PostOut:
    """An anonymous post goes out without its author's id, name or username, even to the author:
    is_mine is how their own page knows it's theirs."""
    return PostOut(
        id=post.id,
        user_id=None if post.is_anonymous else post.user_id,
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
        author=public_post_author(post),
        is_admin_post=post.author.is_system,
        is_pinned=post.pinned_until is not None and post.pinned_until > utc_now(),
        is_anonymous=post.is_anonymous,
        is_mine=post.user_id == viewer.id,
        anonymity_switched=post.anonymity_switched,
        images=post.images,
    )


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
    ).outerjoin(PostVote, Post.id == PostVote.post_id).options(joinedload(Post.author), selectinload(Post.images))

    return query, votes_count, replies_count


@router.post("/", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def create_post(
    content: Annotated[str, Form()],
    scope: Annotated[PostScope, Form()],
    is_anonymous: Annotated[bool, Form()] = False,
    images: Annotated[list[UploadFile], File(description=f"Up to {MAX_POST_IMAGES} pictures: JPG, PNG, WebP or GIF.")] = [],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
):
    """A form upload, so the text and its pictures arrive together and a failed post leaves no files behind.
    Each picture is checked, shrunk and saved as WebP without its photo details (see services/post_images.py)."""
    try:
        post_data = PostCreate(content=content, scope=scope, is_anonymous=is_anonymous)
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False, include_context=False))

    # a form can carry an empty file field when nothing was picked
    images = [image for image in images if image.filename]
    if len(images) > MAX_POST_IMAGES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"A post can have up to {MAX_POST_IMAGES} pictures.")
    try:
        processed = [process_image(read_upload(image.file)) for image in images]
    except ImageRejected as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # counted after shrinking, since that's what's stored
    if processed and sum(len(p.data) for p in processed) > storage_limit(current_user) - storage_used(db, current_user.id):
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="These pictures would go over your storage limit.")

    new_post = Post(
        user_id=current_user.id,
        content=post_data.content,
        scope=post_data.scope.value,
        university=current_user.university,
        college=current_user.college,
        major=current_user.major,
        is_anonymous=post_data.is_anonymous,
    )

    db.add(new_post)
    db.flush()
    saved: list[str] = []
    try:
        for position, picture in enumerate(processed):
            path = save_image(picture)
            saved.append(path)
            db.add(PostImage(
                post_id=new_post.id, user_id=current_user.id, position=position, file_path=path,
                width=picture.width, height=picture.height, size_bytes=len(picture.data), is_animated=picture.is_animated,
            ))
        db.commit()
    except Exception:
        db.rollback()
        remove_image_files(saved)
        raise
    db.refresh(new_post)

    return _map_to_post_out(new_post, current_user, 0)


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
    query = query.order_by(case((Post.pinned_until > utc_now(), 0), else_=1))
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

    return [_map_to_post_out(post, current_user, votes, mine, replies) for post, votes, mine, replies in results]


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

    return _map_to_post_out(post, current_user, votes, mine, replies)


@router.patch("/{post_id}/anonymity", response_model=PostOut)
def switch_post_anonymity(
    post_id: int,
    data: AnonymitySwitch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
):
    """The author's one switch between anonymous and named, after posting."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Post {post_id} not found.")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only change your own posts.")
    if post.anonymity_switched:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You can only change this once.")
    if post.is_anonymous == data.is_anonymous:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The post is already like that.")

    post.is_anonymous = data.is_anonymous
    post.anonymity_switched = True
    if not data.is_anonymous:
        number_post_author_if_needed(db, post)
    db.commit()

    return get_post(post_id, db, current_user)


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

    image_paths = [image.file_path for image in post.images]
    db.delete(post)
    db.commit()
    remove_image_files(image_paths)


@router.get("/{post_id}/images/{image_id}", response_class=FileResponse)
def get_post_image(
    post_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A post's picture, for whoever can read the post."""
    image = db.query(PostImage).filter(PostImage.id == image_id, PostImage.post_id == post_id).first()
    post = db.get(Post, post_id) if image else None
    if not image or not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Picture not found.")
    if not can_see_post(post, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This post is outside your blogs.")
    # pictures never change, so the browser may keep its copy; "private" keeps shared caches from storing it
    return FileResponse(image.file_path, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


@router.post("/{post_id}/vote", response_model=PostVoteResult, status_code=status.HTTP_200_OK)
def vote_post(
    post_id: int,
    vote_action: PostVoteAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
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