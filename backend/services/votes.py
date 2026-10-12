from typing import Callable, Optional

from sqlalchemy.orm import Session


def toggle_vote(db: Session, existing, vote_dir: int, new_vote: Callable[[], object]) -> tuple[str, int]:
    """Add, remove (same direction again) or flip a vote. Returns (message, the user's vote now). Doesn't commit."""
    if existing is None:
        db.add(new_vote())
        return "Vote added.", vote_dir

    if existing.vote_dir == vote_dir:
        db.delete(existing)
        return "Vote removed.", 0

    existing.vote_dir = vote_dir
    return "Vote updated.", vote_dir


def check_vote_dir(vote_dir: int) -> Optional[str]:
    return None if vote_dir in (1, -1) else "vote_dir must be 1 (upvote) or -1 (downvote)."
