import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend import backendConfig
from backend.core.apiDependencies import get_current_user
from backend.core.security import create_access_token, get_password_hash, verify_password
from backend.database import get_db
from backend.models.user import User
from backend.schemas.user import OtpResend, OtpVerify, PasswordChange, UserCreate, UserOut
from backend.services.email import send_otp_email, smtp_configured

router = APIRouter()
logger = logging.getLogger(__name__)


def _now() -> datetime:
    # the otp_* times are stored in UTC without an offset
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _send_code(user: User, db: Session) -> None:
    """Emails the user a new sign-up code, unless one was sent within the cooldown.
    Raises 502 if the email can't be sent."""
    now = _now()
    if user.otp_sent_at and now - user.otp_sent_at < timedelta(seconds=backendConfig.OTP_RESEND_COOLDOWN_SECONDS):
        return

    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        send_otp_email(user, code)
    except (smtplib.SMTPException, OSError):
        logger.exception("Couldn't send sign-up code to user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send the verification email",
        )

    # saved only once sent, so a failed send doesn't start the cooldown
    user.otp_hash = get_password_hash(code)
    user.otp_sent_at = now
    user.otp_expires_at = now + timedelta(minutes=backendConfig.OTP_EXPIRE_MINUTES)
    user.otp_attempts = 0
    db.commit()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED,)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-up isn't available right now",
        )

    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email and existing_email.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already used",
        )

    existing_username = db.query(User).filter(User.username == user_data.username).first()
    if existing_username and existing_username is not existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )

    # signing up again with an email that was never verified starts that account over,
    # so a typo or a lost code doesn't lock the email out
    new_user = existing_email or User(email=user_data.email)
    new_user.username = user_data.username
    new_user.first_name = user_data.first_name
    new_user.last_name = user_data.last_name
    new_user.hashed_password = get_password_hash(user_data.password)
    new_user.country = user_data.country
    new_user.university = user_data.university
    new_user.college = user_data.college
    new_user.major = user_data.major
    new_user.is_verified = False

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    _send_code(new_user, db)
    return new_user


@router.post("/verify-otp")
def verify_otp(otp_data: OtpVerify, db: Session = Depends(get_db)):
    """Checks the emailed code; on success the account is verified and logged in."""
    user = db.query(User).filter(User.email == otp_data.email).first()
    if not user or user.is_verified or not user.otp_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    if user.otp_attempts >= backendConfig.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many attempts")
    if _now() > user.otp_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired")

    if not verify_password(otp_data.code.strip(), user.otp_hash):
        user.otp_attempts += 1
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")

    user.is_verified = True
    user.otp_hash = None
    user.otp_sent_at = None
    user.otp_expires_at = None
    user.otp_attempts = 0
    db.commit()

    return {
        "access_token": create_access_token(data={"sub": str(user.id)}),
        "token_type": "bearer",
    }


# always 204, so it can't be used to find out which emails have accounts
@router.post("/resend-otp", status_code=status.HTTP_204_NO_CONTENT)
def resend_otp(otp_data: OtpResend, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == otp_data.email).first()
    if user and not user.is_verified:
        _send_code(user, db)


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db),):

    user = db.query(User).filter(or_(User.email == form_data.username, User.username == form_data.username)).first()

    # the hidden admin account answers like an unknown account
    if not user or user.is_system or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # the password was right, so it's safe to say which email the code goes to
    if not user.is_verified:
        try:
            _send_code(user, db)
        except HTTPException:
            pass  # the verify screen still opens, and has a resend button
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "email_not_verified", "email": user.email},
        )

    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# the password is the only account detail a user can change
@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    password_data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 400 rather than 401: the client treats any 401 as an expired session and logs out
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()