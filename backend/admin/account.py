import secrets

from sqlalchemy.orm import Session

from backend.accounts.models import User
from backend.config import ADMIN_USERNAME
from backend.core.security import get_password_hash


def get_admin_account(db: Session) -> User:
    """The hidden account that owns the admin's posts and messages; made the first time it's needed."""
    account = db.query(User).filter(User.is_system.is_(True)).first()
    if account:
        return account

    account = User(
        username=ADMIN_USERNAME,
        first_name="Ilna",
        last_name="Admin",
        # sign-up only accepts university emails, so no student can claim this one
        email="admin@ilna-academic.com",
        # a random password nobody knows; login also refuses this account outright
        hashed_password=get_password_hash(secrets.token_urlsafe(32)),
        country="",
        university="",
        college="",
        major="",
        is_verified=True,
        is_system=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account
