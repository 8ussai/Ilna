import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.core.dependencies import get_current_user
from backend.courses.models import (
    Course,
    CourseMember,
    CourseShare,
    CourseShareResponse,
)
from backend.courses.routes import course_counts
from backend.courses.schemas import CourseOwner
from backend.courses.sharing import (
    ShareTarget,
    check_course_limit,
    get_owned_course,
    is_covered,
    members_losing_access,
    membership,
    new_share_code,
    normalize_code,
    shared_with_user,
)
from backend.courses.sharing_schemas import (
    AccessLoss,
    CoursePreview,
    CourseShareOut,
    SharingApply,
    SharingOut,
)
from backend.database import get_db
from backend.friends.routes import findable_users
from backend.notifications.models import Notification
from backend.notifications.service import NotificationType

# Registered before courses/routes.py, whose /courses/{course_id} would otherwise catch /courses/shared-with-me.
router = APIRouter()


# a course as someone sees it before adding it
def _preview(db: Session, course: Course, user: User, counts: Optional[dict] = None) -> CoursePreview:
    counts = counts if counts is not None else course_counts(db, [course.id])
    documents, audio, links, _ = counts.get(course.id, (0, 0, 0, 0))
    return CoursePreview(
        id=course.id,
        title=course.title,
        description=course.description,
        color=course.color,
        owner=CourseOwner.model_validate(course.owner),
        is_public=course.is_public,
        documents_count=documents,
        audio_count=audio,
        links_count=links,
        is_owner=course.user_id == user.id,
        is_member=db.get(CourseMember, (course.id, user.id)) is not None,
        created_at=course.created_at,
    )


def _reachable_course(db: Session, course_id: int, user: User) -> Course:
    """A course the user could add (public, or shared with them). 404 otherwise, as for a course that
    doesn't exist, so private courses can't be found."""
    course = db.get(Course, course_id)
    if course is None or not is_covered(db, course, user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
    return course


# --- finding and adding courses ---


@router.get("/shared-with-me", response_model=List[CoursePreview])
def get_shared_with_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Courses shared with the user that they haven't added or ignored yet, newest first."""
    courses = shared_with_user(db, current_user)
    counts = course_counts(db, [c.id for c in courses])
    return [_preview(db, c, current_user, counts) for c in courses]


@router.get("/by-code/{code}", response_model=CoursePreview)
def find_course_by_code(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A course by its ID ("K7Q2-M9XD"), if it's public or shared with the user. A private course gives
    the same 404 as a wrong code."""
    course = db.query(Course).filter(Course.share_code == normalize_code(code)).first()
    if course is None or not is_covered(db, course, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No course with this ID.")
    return _preview(db, course, current_user)


@router.get("/public-by/{username}", response_model=List[CoursePreview])
def get_public_courses_of(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A student's public courses, newest first, for their profile card. Private courses never show,
    even ones shared with the viewer."""
    owner = findable_users(db.query(User)).filter(User.username == username.lower()).first()
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    courses = (
        db.query(Course)
        .filter(Course.user_id == owner.id, Course.is_public.is_(True))
        .order_by(Course.created_at.desc(), Course.id.desc())
        .all()
    )
    counts = course_counts(db, [c.id for c in courses])
    return [_preview(db, c, current_user, counts) for c in courses]


@router.post("/{course_id}/membership", response_model=CoursePreview)
def add_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Adds someone else's course to the user's courses, read-only. Counts toward the course limit, but its
    files don't count toward the user's storage."""
    course = _reachable_course(db, course_id, current_user)
    if course.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This is your own course.")
    if db.get(CourseMember, (course.id, current_user.id)) is None:
        check_course_limit(db, current_user)
        db.add(CourseMember(course_id=course.id, user_id=current_user.id))
        # it's answered now, so it leaves "Shared with you"
        db.query(CourseShareResponse).filter(
            CourseShareResponse.course_id == course.id, CourseShareResponse.user_id == current_user.id
        ).delete()
        db.commit()
    return _preview(db, course, current_user)


@router.delete("/{course_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Removes an added course from the user's courses. It won't come back under "Shared with you";
    they can still add it again by its ID."""
    deleted = (
        db.query(CourseMember)
        .filter(CourseMember.course_id == course_id, CourseMember.user_id == current_user.id)
        .delete()
    )
    if deleted and db.get(CourseShareResponse, (course_id, current_user.id)) is None:
        db.add(CourseShareResponse(course_id=course_id, user_id=current_user.id))
    db.commit()


@router.post("/{course_id}/ignore", status_code=status.HTTP_204_NO_CONTENT)
def ignore_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ignore on "Shared with you": the course stops showing there for good."""
    course = _reachable_course(db, course_id, current_user)
    if db.get(CourseShareResponse, (course.id, current_user.id)) is None:
        db.add(CourseShareResponse(course_id=course.id, user_id=current_user.id))
        db.commit()


# --- the owner's sharing settings ---


# one share, with the person for a "user" share
def _share_out(db: Session, share: CourseShare) -> CourseShareOut:
    user = None
    if share.target_type == ShareTarget.user.value:
        target = db.get(User, int(share.target))
        user = CourseOwner.model_validate(target) if target else None
    return CourseShareOut(id=share.id, target_type=share.target_type, user=user)


# the owner's sharing settings with how many people have the course
def _sharing_out(db: Session, course: Course) -> SharingOut:
    members = sum(1 for m in course.members if membership(db, course, db.get(User, m.user_id)) is not None)
    return SharingOut(
        share_code=course.share_code,
        is_public=course.is_public,
        notes_downloadable=course.notes_downloadable,
        shares=[_share_out(db, s) for s in sorted(course.shares, key=lambda s: s.id)],
        members_count=members,
    )


# the course's sharing settings, for its owner
@router.get("/{course_id}/sharing", response_model=SharingOut)
def get_sharing(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _sharing_out(db, get_owned_course(db, course_id, current_user))


# The shares the Share dialog asks for, as unsaved rows. A person who can't be shared with is a 404.
def _wanted_shares(db: Session, course: Course, owner: User, data: SharingApply) -> list[CourseShare]:
    shares = []
    for group in dict.fromkeys(data.groups):
        # the owner's own university, college or major; friends has no target
        target = "" if group == ShareTarget.friends else getattr(owner, group.value)
        shares.append(CourseShare(course_id=course.id, target_type=group.value, target=target))
    for user_id in dict.fromkeys(data.user_ids):
        recipient = db.get(User, user_id)
        if (
            recipient is None
            or recipient.id == owner.id
            or recipient.is_system
            or recipient.is_test
            or recipient.is_banned
            or not recipient.is_verified
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        shares.append(CourseShare(course_id=course.id, target_type=ShareTarget.user.value, target=str(user_id)))
    return shares


def _send_again(db: Session, course: Course, owner: User) -> None:
    """Sends the course again to everyone a share reaches who hasn't added it: it comes back under
    "Shared with you" even for people who pressed Ignore or left it, and people shared with by name
    get a new notification. Doesn't commit."""
    for response in db.query(CourseShareResponse).filter(CourseShareResponse.course_id == course.id).all():
        user = db.get(User, response.user_id)
        # is_public=False: only a share brings it back, not the course being public
        if (
            user is not None
            and db.get(CourseMember, (course.id, user.id)) is None
            and is_covered(db, course, user, is_public=False)
        ):
            db.delete(response)
    for share in course.shares:
        if share.target_type != ShareTarget.user.value or db.get(CourseMember, (course.id, int(share.target))):
            continue
        db.add(
            Notification(
                user_id=int(share.target),
                actor_id=owner.id,
                type=NotificationType.course_shared.value,
                message=json.dumps({"course_id": course.id, "title": course.title}, ensure_ascii=False),
            )
        )


@router.post("/{course_id}/sharing/impact", response_model=AccessLoss)
def get_sharing_impact(
    course_id: int,
    data: SharingApply,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """How many people who added the course the Share dialog's changes would remove, asked before saving them."""
    course = get_owned_course(db, course_id, current_user)
    wanted = _wanted_shares(db, course, current_user, data)
    return AccessLoss(members_losing=members_losing_access(db, course, is_public=data.is_public, shares=wanted))


@router.put("/{course_id}/sharing", response_model=SharingOut)
def apply_sharing(
    course_id: int,
    data: SharingApply,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The Share button: saves the whole dialog at once (public or private, who it's shared with, note
    downloads), then sends the course again to everyone it's shared with. Members no share or public
    setting still reaches lose the course."""
    course = get_owned_course(db, course_id, current_user)
    wanted = _wanted_shares(db, course, current_user, data)
    wanted_keys = {(s.target_type, s.target) for s in wanted}
    current = {(s.target_type, s.target): s for s in course.shares}
    for key, share in current.items():
        if key not in wanted_keys:
            db.delete(share)
    for share in wanted:
        if (share.target_type, share.target) not in current:
            db.add(share)
    course.is_public = data.is_public
    course.notes_downloadable = data.notes_downloadable
    db.flush()
    db.refresh(course)
    _send_again(db, course, current_user)
    db.commit()
    db.refresh(course)
    return _sharing_out(db, course)


@router.post("/{course_id}/sharing/new-code", response_model=SharingOut)
def renew_share_code(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A new course ID; the old one stops working. People who already added the course keep it."""
    course = get_owned_course(db, course_id, current_user)
    course.share_code = new_share_code(db)
    db.commit()
    return _sharing_out(db, course)
