"""Who can see a course besides its owner.

A course is private unless the owner makes it public. Someone "covered" by a course can add it and then
read it (never change it): everyone when it's public, otherwise whoever one of its shares reaches. A member
who stops being covered (the course went private, a share was removed, the owner unfriended them) loses it
straight away; if they're covered again later it comes back.
"""
import secrets
from enum import Enum
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.models.course import Course, CourseMember, CourseShare, CourseShareResponse
from backend.models.user import Friend, User
from backend.services.usage import course_limit

# no 0/O or 1/I/L, which are easy to misread when a code is typed from a screen
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class ShareTarget(str, Enum):
    university = "university"
    college = "college"
    major = "major"
    friends = "friends"
    user = "user"


def new_share_code(db: Session) -> str:
    """A random course ID like "K7Q2-M9XD" that no other course has."""
    while True:
        raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        code = f"{raw[:4]}-{raw[4:]}"
        if not db.query(Course.id).filter(Course.share_code == code).first():
            return code


def normalize_code(code: str) -> str:
    """What people type ("k7q2m9xd", "K7Q2 M9XD") as stored ("K7Q2-M9XD")."""
    raw = "".join(ch for ch in code.upper() if ch.isalnum())
    return f"{raw[:4]}-{raw[4:]}" if len(raw) == 8 else raw


def share_covers(share: CourseShare, user: User, friend_of_owner: bool) -> bool:
    if share.target_type == ShareTarget.university.value:
        return user.university == share.target
    if share.target_type == ShareTarget.college.value:
        return user.college == share.target
    if share.target_type == ShareTarget.major.value:
        return user.major == share.target
    if share.target_type == ShareTarget.friends.value:
        return friend_of_owner
    return share.target == str(user.id)


def is_covered(
    db: Session,
    course: Course,
    user: User,
    *,
    is_public: Optional[bool] = None,
    shares: Optional[Iterable[CourseShare]] = None,
) -> bool:
    """Whether the course reaches the user. is_public and shares can be given to ask "what if" (to warn the
    owner how many people a change would remove)."""
    if user.id == course.user_id:
        return True
    if course.is_public if is_public is None else is_public:
        return True
    shares = list(course.shares if shares is None else shares)
    if not shares:
        return False
    friend_of_owner = any(s.target_type == ShareTarget.friends.value for s in shares) and (
        db.get(Friend, (course.user_id, user.id)) is not None
    )
    return any(share_covers(s, user, friend_of_owner) for s in shares)


def membership(db: Session, course: Course, user: User) -> Optional[CourseMember]:
    """The user's membership, if they added the course and it still reaches them."""
    member = db.get(CourseMember, (course.id, user.id))
    if member is None or not is_covered(db, course, user):
        return None
    return member


def _not_found(course_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course with id {course_id} not found.")


def get_viewable_course(db: Session, course_id: int, user: User) -> tuple[Course, bool]:
    """The course and whether the user owns it, for reading. Anyone else gets 404, so a private
    course's existence isn't given away."""
    course = db.get(Course, course_id)
    if course is None:
        raise _not_found(course_id)
    if course.user_id == user.id:
        return course, True
    if membership(db, course, user) is None:
        raise _not_found(course_id)
    return course, False


def get_owned_course(db: Session, course_id: int, user: User) -> Course:
    """The course, for changing it: only its owner. A member is told it's read-only; anyone else gets 404."""
    course, is_owner = get_viewable_course(db, course_id, user)
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the course's owner can change it.")
    return course


def member_courses(db: Session, user: User) -> list[tuple[Course, CourseMember]]:
    """Courses the user added that still reach them."""
    rows = (
        db.query(Course, CourseMember)
        .join(CourseMember, CourseMember.course_id == Course.id)
        .filter(CourseMember.user_id == user.id)
        .all()
    )
    return [(course, member) for course, member in rows if is_covered(db, course, user)]


def courses_in_use(db: Session, user: User) -> int:
    """Owned plus added courses: what the course limit counts."""
    owned = db.query(Course.id).filter(Course.user_id == user.id).count()
    return owned + len(member_courses(db, user))


def check_course_limit(db: Session, user: User) -> None:
    """Refuses creating or adding a course at the limit. Someone over it (premium turned off) keeps theirs."""
    limit = course_limit(user)
    if limit is not None and courses_in_use(db, user) >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You can have up to {limit} courses, including added ones. Remove one or get Premium for unlimited courses.",
        )


def shared_with_user(db: Session, user: User) -> list[Course]:
    """Courses someone shared with the user (a share reaches them) that they haven't added or ignored.
    Public courses only show here when they're also shared with the user."""
    friend_owner_ids = [owner_id for (owner_id,) in db.query(Friend.user_id).filter(Friend.friend_id == user.id)]
    matching = or_(
        (CourseShare.target_type == ShareTarget.university.value) & (CourseShare.target == user.university),
        (CourseShare.target_type == ShareTarget.college.value) & (CourseShare.target == user.college),
        (CourseShare.target_type == ShareTarget.major.value) & (CourseShare.target == user.major),
        (CourseShare.target_type == ShareTarget.friends.value) & (Course.user_id.in_(friend_owner_ids)),
        (CourseShare.target_type == ShareTarget.user.value) & (CourseShare.target == str(user.id)),
    )
    added = db.query(CourseMember.course_id).filter(CourseMember.user_id == user.id)
    answered = db.query(CourseShareResponse.course_id).filter(CourseShareResponse.user_id == user.id)
    return (
        db.query(Course)
        .join(CourseShare, CourseShare.course_id == Course.id)
        .filter(matching, Course.user_id != user.id, Course.id.notin_(added), Course.id.notin_(answered))
        .distinct()
        .order_by(Course.id.desc())
        .all()
    )


def members_losing_access(
    db: Session, course: Course, *, is_public: Optional[bool] = None, shares: Optional[list[CourseShare]] = None
) -> int:
    """How many current members a change to is_public or the shares would remove."""
    count = 0
    for member in course.members:
        user = db.get(User, member.user_id)
        if user and is_covered(db, course, user) and not is_covered(db, course, user, is_public=is_public, shares=shares):
            count += 1
    return count
