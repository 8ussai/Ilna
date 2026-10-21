from sqlalchemy import inspect, or_
from sqlalchemy.orm import Session

from backend.models.admin import Report
from backend.models.contact import ContactMessage
from backend.models.course import Course
from backend.models.notification import Notification
from backend.models.post import Post, PostVote, Reply, ReplyVote, ThreadAnonNumber
from backend.models.study import StudyGeneration
from backend.models.user import Friend, User
from backend.services.admin_account import get_admin_account
from backend.services.embeddings import delete_course_vectors
from backend.services.post_images import remove_image_files
from backend.services.reply_removal import remove_reply


def delete_account(db: Session, user: User) -> dict:
    """Removes the user and everything that is theirs, in one transaction. Commits.
    SQLite's own cascades are off, so each kind of row is removed here explicitly.
    Returns what was removed, for the admin log."""
    user_id = user.id
    admin_account_id = get_admin_account(db).id

    courses = db.query(Course).filter(Course.user_id == user_id).all()
    course_ids = [course.id for course in courses]
    file_paths = [material.file_path for course in courses for material in course.materials]

    own_posts = db.query(Post).filter(Post.user_id == user_id).all()
    own_post_ids = {post.id for post in own_posts}
    image_paths = [image.file_path for post in own_posts for image in post.images]

    # replies on other people's posts follow the placeholder rule, newest first so answers go before what they answer
    other_replies = (
        db.query(Reply)
        .filter(Reply.user_id == user_id, Reply.is_deleted.is_(False), Reply.post_id.notin_(own_post_ids))
        .order_by(Reply.id.desc())
        .all()
    )
    removed = {
        "posts": len(own_posts),
        "replies_on_others_posts": len(other_replies),
        "courses": len(course_ids),
        "files": len(file_paths),
    }
    for reply in other_replies:
        # an earlier one in this loop may already have removed it as an emptied placeholder
        if not inspect(reply).was_deleted:
            # its answers may have just been removed above
            db.refresh(reply)
            remove_reply(db, reply, placeholder_owner_id=admin_account_id)

    # their posts go with every reply, vote and notification on them (the ORM cascade)
    for post in own_posts:
        db.delete(post)
    db.flush()

    db.query(PostVote).filter(PostVote.user_id == user_id).delete(synchronize_session=False)
    db.query(ReplyVote).filter(ReplyVote.user_id == user_id).delete(synchronize_session=False)
    # their friends list, and their place on everyone else's
    db.query(Friend).filter(or_(Friend.user_id == user_id, Friend.friend_id == user_id)).delete(synchronize_session=False)
    # their numbers in other threads; each post's counter keeps the numbers from being handed out again
    db.query(ThreadAnonNumber).filter(ThreadAnonNumber.user_id == user_id).delete(synchronize_session=False)
    db.query(Notification).filter(
        or_(Notification.user_id == user_id, Notification.actor_id == user_id)
    ).delete(synchronize_session=False)
    db.query(StudyGeneration).filter(StudyGeneration.user_id == user_id).delete(synchronize_session=False)
    db.query(ContactMessage).filter(ContactMessage.user_id == user_id).delete(synchronize_session=False)

    # reports they made, and reports on anything that no longer exists or is now a placeholder
    db.query(Report).filter(Report.reporter_id == user_id).delete(synchronize_session=False)
    db.query(Report).filter(
        Report.post_id.isnot(None), Report.post_id.notin_(db.query(Post.id))
    ).delete(synchronize_session=False)
    db.query(Report).filter(
        Report.reply_id.isnot(None),
        Report.reply_id.notin_(db.query(Reply.id).filter(Reply.is_deleted.is_(False))),
    ).delete(synchronize_session=False)

    # courses take their materials, transcripts, notes, links, summaries, quizzes and attempts with them
    for course in courses:
        db.delete(course)
    db.flush()

    db.expire(user)
    db.delete(user)
    db.commit()

    # after the commit, so a failed file or vector delete never leaves rows pointing at missing data
    from backend.routes.courses import _remove_files, _remove_vectors
    _remove_files(file_paths)
    remove_image_files(image_paths)
    for course_id in course_ids:
        _remove_vectors(delete_course_vectors, course_id)

    return removed
