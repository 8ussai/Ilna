from typing import Iterable, Optional

from sqlalchemy import tuple_, update
from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.blog.models import Post, Reply, ThreadAnonNumber
from backend.blog.schemas import PostAuthor

# How anonymous authors show, per thread (post):
# - an anonymous post shows its author as "Anonymous"
# - while the post is anonymous, its author's anonymous replies in that thread show as "Author"
# - everyone else's anonymous replies show as "Anonymous N", one number per person in that thread
# - a named post's author gets a number too if they reply anonymously, so "Author" never gives them away


def is_thread_author(post: Post, user_id: int) -> bool:
    """The author of an anonymous post, who shows as "Author" in its thread instead of a number."""
    return post.is_anonymous and post.user_id == user_id


def assign_anon_number(db: Session, post_id: int, user_id: int) -> int:
    """The user's "Anonymous N" number in this thread, given out the first time they need one.
    The post's counter only goes up, so a number is never handed to someone else. Doesn't commit."""
    existing = db.get(ThreadAnonNumber, (post_id, user_id))
    if existing is not None:
        return existing.number
    # one UPDATE ... RETURNING, so two people going anonymous at once can't get the same number
    number = db.execute(
        update(Post).where(Post.id == post_id).values(anon_counter=Post.anon_counter + 1).returning(Post.anon_counter)
    ).scalar_one()
    db.add(ThreadAnonNumber(post_id=post_id, user_id=user_id, number=number))
    db.flush()
    return number


def number_anonymous_reply(db: Session, post: Post, user_id: int) -> None:
    """Call when a reply in this thread becomes anonymous: gives its author a number unless they're "Author"."""
    if not is_thread_author(post, user_id):
        assign_anon_number(db, post.id, user_id)


def number_post_author_if_needed(db: Session, post: Post) -> None:
    """Call after a post is switched to named: its author's anonymous replies can't say "Author" any more."""
    has_anonymous_replies = (
        db.query(Reply.id)
        .filter(
            Reply.post_id == post.id,
            Reply.user_id == post.user_id,
            Reply.is_anonymous.is_(True),
            Reply.is_deleted.is_(False),
        )
        .first()
    )
    if has_anonymous_replies:
        assign_anon_number(db, post.id, post.user_id)


def thread_anon_numbers(db: Session, post_id: int) -> dict[int, int]:
    """user id -> number, for everyone with a number in this thread."""
    rows = db.query(ThreadAnonNumber.user_id, ThreadAnonNumber.number).filter(ThreadAnonNumber.post_id == post_id)
    return dict(rows.all())


def anon_numbers_for(db: Session, pairs: Iterable[tuple[int, int]]) -> dict[tuple[int, int], int]:
    """(post id, user id) -> number, for many threads at once (the notifications list)."""
    pairs = set(pairs)
    if not pairs:
        return {}
    rows = db.query(ThreadAnonNumber.post_id, ThreadAnonNumber.user_id, ThreadAnonNumber.number).filter(
        tuple_(ThreadAnonNumber.post_id, ThreadAnonNumber.user_id).in_(pairs)
    )
    return {(post_id, user_id): number for post_id, user_id, number in rows.all()}


def anonymous_author(number: Optional[int] = None, is_thread_author: bool = False) -> PostAuthor:
    """What everyone else sees in place of the author: no id, name or username."""
    return PostAuthor(
        id=0,
        username="",
        first_name="",
        last_name="",
        is_premium=False,
        anon_number=number,
        is_thread_author=is_thread_author,
    )


# what others see in place of an anonymous reply's author: "Author" or "Anonymous N"
def anonymous_reply_author(post: Post, user_id: int, number: Optional[int]) -> PostAuthor:
    if is_thread_author(post, user_id):
        return anonymous_author(is_thread_author=True)
    return anonymous_author(number)


# a post's author as others see it
def public_post_author(post: Post) -> PostAuthor | User:
    return anonymous_author() if post.is_anonymous else post.author


def public_reply_author(reply: Reply, post: Post, numbers: dict[int, int]) -> PostAuthor | User:
    """numbers is the thread's user id -> number."""
    if not reply.is_anonymous:
        return reply.author
    return anonymous_reply_author(post, reply.user_id, numbers.get(reply.user_id))
