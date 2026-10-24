from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, or_
from sqlalchemy.orm import Query as OrmQuery
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.accounts.usage import friend_limit
from backend.config import USER_SEARCH_LIMIT
from backend.core.dependencies import get_current_user, get_full_user
from backend.database import get_db
from backend.friends.models import Friend
from backend.friends.schemas import FriendList, PublicProfile

# Friends work like Codeforces: adding someone puts them on your own list. They aren't asked,
# aren't notified, and can't see who added them.
router = APIRouter()


def findable_users(query: OrmQuery) -> OrmQuery:
    """Students who can be searched, looked up and added: not the admin account, test accounts,
    banned users, or sign-ups that were never verified."""
    return query.filter(
        User.is_system.is_(False),
        User.is_test.is_(False),
        User.is_banned.is_(False),
        User.is_verified.is_(True),
    )


# ids of the people on a user's friends list
def _friend_ids(db: Session, user_id: int) -> set[int]:
    return {friend_id for (friend_id,) in db.query(Friend.friend_id).filter(Friend.user_id == user_id)}


# a student's public profile card
def _profile(user: User, is_friend: bool, is_self: bool = False) -> PublicProfile:
    return PublicProfile(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        is_premium=user.is_premium,
        university=user.university,
        college=user.college,
        major=user.major,
        is_friend=is_friend,
        is_self=is_self,
    )


def _like(text: str) -> str:
    """A LIKE pattern that matches the text anywhere, with % and _ taken literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/users/search", response_model=list[PublicProfile])
def search_users(
    q: str = Query(..., min_length=1, max_length=60, description="Part of a name or @username."),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Students matching a name or username, people from the searcher's university first. Never by email."""
    words = q.strip().lstrip("@").split()
    if not words:
        return []

    query = findable_users(db.query(User)).filter(User.id != current_user.id)
    # every word has to match somewhere, so "sara ali" finds Sara Ali
    for word in words:
        pattern = _like(word)
        query = query.filter(
            or_(
                User.username.ilike(pattern, escape="\\"),
                User.first_name.ilike(pattern, escape="\\"),
                User.last_name.ilike(pattern, escape="\\"),
            )
        )
    users = (
        query.order_by(case((User.university == current_user.university, 0), else_=1), User.username)
        .offset(offset)
        .limit(USER_SEARCH_LIMIT)
        .all()
    )

    friends = _friend_ids(db, current_user.id)
    return [_profile(user, user.id in friends) for user in users]


@router.get("/users/{username}", response_model=PublicProfile)
def get_profile(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The card shown when an author's name is clicked."""
    user = findable_users(db.query(User)).filter(User.username == username.lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    is_friend = db.get(Friend, (current_user.id, user.id)) is not None
    return _profile(user, is_friend, is_self=user.id == current_user.id)


def _visible_friends(db: Session, user_id: int) -> list[User]:
    """The list, newest first. Banned users are left out while banned and come back when unbanned."""
    return (
        findable_users(db.query(User))
        .join(Friend, Friend.friend_id == User.id)
        .filter(Friend.user_id == user_id)
        .order_by(Friend.created_at.desc(), User.id.desc())
        .all()
    )


# the user's friends list with its count and cap
@router.get("/me/friends", response_model=FriendList)
def get_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    friends = _visible_friends(db, current_user.id)
    return FriendList(
        friends=[_profile(user, True) for user in friends],
        count=len(friends),
        limit=friend_limit(current_user),
    )


@router.put("/me/friends/{user_id}", response_model=PublicProfile)
def add_friend(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_full_user),
):
    """Adds to the list straight away, with no request and no notification. Refused at the cap;
    someone over it (premium turned off) keeps their list but can't add more."""
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't add yourself.")
    user = findable_users(db.query(User)).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if db.get(Friend, (current_user.id, user_id)) is not None:
        return _profile(user, True)

    limit = friend_limit(current_user)
    if len(_visible_friends(db, current_user.id)) >= limit:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Your friends list is full ({limit}).")

    db.add(Friend(user_id=current_user.id, friend_id=user_id))
    db.commit()
    return _profile(user, True)


@router.delete("/me/friends/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Always allowed, even over the cap. Removing someone who isn't on the list does nothing."""
    db.query(Friend).filter(Friend.user_id == current_user.id, Friend.friend_id == user_id).delete()
    db.commit()
