from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from backend.database import get_db
from backend.models.user import User
from backend.backendConfig import oauth2_scheme, admin_oauth2_scheme, SECRET_KEY, ALGORITHM
from backend.core.security import ADMIN_SCOPE


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
