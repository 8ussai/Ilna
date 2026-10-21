import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.core.apiDependencies import get_current_user
from backend.database import get_db
from backend.models.course import Course, CourseMember, CourseShare, CourseShareResponse
from backend.models.notification import Notification
from backend.models.user import User
from backend.schemas.course import CourseOwner
from backend.schemas.course_sharing import (
    AccessLoss,
    CoursePreview,
    CourseShareOut,
    ShareCreate,
    SharingOut,
    SharingUpdate,
)
from backend.routes.courses import course_counts
from backend.services.course_sharing import (
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
from backend.services.notifications import NotificationType
from backend.services.storage import course_bytes, storage_used
from backend.services.usage import storage_limit

# Registered before routes/courses.py, whose /courses/{course_id} would otherwise catch /courses/shared-with-me.
router = APIRouter()


def _preview(db: Session, course: Course, user: User, counts: Optional[dict] = None) -> CoursePreview:
    counts = counts if counts is not None else course_counts(db, [course.id])
    documents, audio, links, _ = counts.get(course.id, (0, 0, 0, 0))
    return CoursePreview(
        id=course.id, title=course.title, description=course.description, color=course.color,
        owner=CourseOwner.model_validate(course.owner), is_public=course.is_public,
        documents_count=documents, audio_count=audio, links_count=links,
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


@router.post("/{course_id}/membership", response_model=CoursePreview)
def add_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Adds someone else's course to the user's courses, read-only. Counts toward the course limit, and its
    files toward the user's storage."""
    course = _reachable_course(db, course_id, current_user)
    if course.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This is your own course.")
    if db.get(CourseMember, (course.id, current_user.id)) is None:
        check_course_limit(db, current_user)
        if course_bytes(db, [course.id]) > storage_limit(current_user) - storage_used(db, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="This course's files would go over your storage limit.",
            )
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
    deleted = db.query(CourseMember).filter(
        CourseMember.course_id == course_id, CourseMember.user_id == current_user.id
    ).delete()
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

def _share_out(db: Session, share: CourseShare) -> CourseShareOut:
    user = None
    if share.target_type == ShareTarget.user.value:
        target = db.get(User, int(share.target))
        user = CourseOwner.model_validate(target) if target else None
    return CourseShareOut(id=share.id, target_type=share.target_type, user=user)


def _sharing_out(db: Session, course: Course) -> SharingOut:
    members = sum(1 for m in course.members if membership(db, course, db.get(User, m.user_id)) is not None)
    return SharingOut(
        share_code=course.share_code,
        is_public=course.is_public,
        shares=[_share_out(db, s) for s in sorted(course.shares, key=lambda s: s.id)],
        members_count=members,
    )


@router.get("/{course_id}/sharing", response_model=SharingOut)
def get_sharing(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _sharing_out(db, get_owned_course(db, course_id, current_user))


@router.get("/{course_id}/sharing/impact", response_model=AccessLoss)
def get_sharing_impact(
    course_id: int,
    make_private: bool = Query(False, description="How many would go if the course went private."),
    remove_share: Optional[int] = Query(None, description="How many would go if this share were removed."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Shown before the owner confirms a change that takes the course away from people who added it."""
    course = get_owned_course(db, course_id, current_user)
    is_public = False if make_private else None
    shares = [s for s in course.shares if s.id != remove_share] if remove_share is not None else None
    return AccessLoss(members_losing=members_losing_access(db, course, is_public=is_public, shares=shares))


@router.patch("/{course_id}/sharing", response_model=SharingOut)
def update_sharing(
    course_id: int,
    data: SharingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Public or private. Going private removes the course for members no share still reaches."""
    course = get_owned_course(db, course_id, current_user)
    course.is_public = data.is_public
    db.commit()
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


@router.post("/{course_id}/shares", response_model=SharingOut)
def add_share(
    course_id: int,
    data: ShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Shares the course with the owner's university, college or major, their friends, or one person.
    A person shared with by name gets a notification; groups just see it under "Shared with you"."""
    course = get_owned_course(db, course_id, current_user)
    recipient = None
    if data.target_type == ShareTarget.user:
        recipient = db.get(User, data.user_id) if data.user_id is not None else None
        if (recipient is None or recipient.id == current_user.id or recipient.is_system or recipient.is_test
                or recipient.is_banned or not recipient.is_verified):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        target = str(recipient.id)
    elif data.target_type == ShareTarget.friends:
        target = ""
    else:
        # the owner's own university, college or major
        target = getattr(current_user, data.target_type.value)

    exists = db.query(CourseShare).filter(
        CourseShare.course_id == course.id, CourseShare.target_type == data.target_type.value, CourseShare.target == target
    ).first()
    if exists is None:
        db.add(CourseShare(course_id=course.id, target_type=data.target_type.value, target=target))
        if recipient is not None and db.get(CourseMember, (course.id, recipient.id)) is None:
            db.add(Notification(
                user_id=recipient.id, actor_id=current_user.id, type=NotificationType.course_shared.value,
                message=json.dumps({"course_id": course.id, "title": course.title}, ensure_ascii=False),
            ))
        db.commit()
        db.refresh(course)
    return _sharing_out(db, course)


@router.delete("/{course_id}/shares/{share_id}", response_model=SharingOut)
def remove_share(
    course_id: int,
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Members this share was the only way in for lose the course."""
    course = get_owned_course(db, course_id, current_user)
    db.query(CourseShare).filter(CourseShare.id == share_id, CourseShare.course_id == course.id).delete()
    db.commit()
    db.refresh(course)
    return _sharing_out(db, course)
