from datetime import timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from backend.database import get_db
from backend.models.user import User
from backend.backendConfig import oauth2_scheme, admin_oauth2_scheme, SECRET_KEY, ALGORITHM
from backend.core.security import ADMIN_SCOPE

# the detail the frontend looks for to show "your account has been suspended"
ACCOUNT_SUSPENDED = "Account suspended"
# a test account the admin turned off; the frontend says so instead of "suspended"
TEST_ACCOUNT_OFF = "Test account turned off"
# posting, replying, voting and Contact us aren't open to test accounts
TEST_ACCOUNT_NOT_ALLOWED = "Test accounts can't do this"


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        user_id: str = payload.get("sub")

        # an admin login isn't a student login
        if user_id is None or payload.get("scope") == ADMIN_SCOPE or not str(user_id).isdigit():
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()

    # the hidden admin account is never used as a student login
    if user is None or user.is_system:
        raise credentials_exception

    # a login from before the last password change is over; tokens from before iat existed count as older
    if user.password_changed_at:
        changed = int(user.password_changed_at.replace(tzinfo=timezone.utc).timestamp())
        issued = payload.get("iat")
        if not isinstance(issued, (int, float)) or issued < changed:
            raise credentials_exception

    # checked on every request, so a ban logs the student out right away; the app shows the suspended notice
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCOUNT_SUSPENDED)
    # the same for a test account the admin turned off
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=TEST_ACCOUNT_OFF)

    return user


def get_full_user(user: User = Depends(get_current_user)) -> User:
    """get_current_user, but test accounts are refused: for posting, replying, voting and Contact us."""
    if user.is_test:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=TEST_ACCOUNT_NOT_ALLOWED)
    return user


def get_admin(token: str = Depends(admin_oauth2_scheme)) -> None:
    """Lets a request through only with a valid admin login from /admin/verify-code."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        payload = {}
    if payload.get("scope") != ADMIN_SCOPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin login required",
            headers={"WWW-Authenticate": "Bearer"},
        )
