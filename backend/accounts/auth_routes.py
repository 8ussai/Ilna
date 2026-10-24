import logging
import secrets
import smtplib
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend import config
from backend.accounts.models import User
from backend.accounts.schemas import (
    OtpResend,
    OtpVerify,
    PasswordChange,
    PasswordReset,
    PasswordResetRequest,
    UserCreate,
    UserOut,
)
from backend.core.dependencies import (
    ACCOUNT_SUSPENDED,
    TEST_ACCOUNT_NOT_ALLOWED,
    TEST_ACCOUNT_OFF,
    get_current_user,
)
from backend.core.email import (
    send_otp_email,
    send_password_changed_email,
    send_password_reset_email,
    smtp_configured,
)
from backend.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.database import SessionLocal, get_db, utc_now

router = APIRouter()
logger = logging.getLogger(__name__)


def send_code(user: User, db: Session) -> bool:
    """Emails the user a new sign-up code, unless one was sent within the cooldown.
    Returns whether a code was sent. Raises 502 if the email can't be sent."""
    now = utc_now()
    if user.otp_sent_at and now - user.otp_sent_at < timedelta(seconds=config.OTP_RESEND_COOLDOWN_SECONDS):
        return False

    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        send_otp_email(user, code)
    except (smtplib.SMTPException, OSError):
        logger.exception("Couldn't send sign-up code to user %s", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send the verification email",
        )

    # saved only once sent, so a failed send doesn't start the cooldown.
    # otp_hash holds the recent codes' hashes, space-separated; they stay valid until the newest expires
    still_valid = user.otp_hash and user.otp_expires_at and now < user.otp_expires_at
    hashes = [*(user.otp_hash.split() if still_valid else []), get_password_hash(code)][-config.OTP_CODES_KEPT :]
    user.otp_hash = " ".join(hashes)
    user.otp_sent_at = now
    user.otp_expires_at = now + timedelta(minutes=config.OTP_EXPIRE_MINUTES)
    user.otp_attempts = 0
    db.commit()
    logger.info("Sent a sign-up code to user %s (%s codes now valid)", user.id, len(hashes))
    return True


# signs a student up and emails a 6-digit code to verify the address
@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
)
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

    send_code(new_user, db)
    return new_user


@router.post("/verify-otp")
def verify_otp(otp_data: OtpVerify, db: Session = Depends(get_db)):
    """Checks the emailed code; on success the account is verified and logged in."""
    user = db.query(User).filter(User.email == otp_data.email).first()
    if not user or user.is_verified or not user.otp_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    if user.otp_attempts >= config.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many attempts")
    if utc_now() > user.otp_expires_at:
        # logged so late emails show up in the server log
        logger.info(
            "Sign-up code for user %s was entered %s after it expired", user.id, utc_now() - user.otp_expires_at
        )
        # email a fresh code right away, so the student doesn't have to ask for one
        try:
            sent = send_code(user, db)
        except HTTPException:
            sent = False
        detail = "Code expired, new code sent" if sent else "Code expired"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # any recent code works, newest first
    code = otp_data.code.strip()
    hashes = user.otp_hash.split()[::-1]
    match = next((i for i, h in enumerate(hashes) if verify_password(code, h)), None)
    if match is None:
        user.otp_attempts += 1
        db.commit()
        logger.info(
            "Wrong sign-up code for user %s (attempt %s, last code sent %s)",
            user.id,
            user.otp_attempts,
            user.otp_sent_at,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    if match > 0:
        # logged so late or out-of-order emails show up in the server log
        logger.info("User %s verified with an older sign-up code (%s newer sent)", user.id, match)
    # the code was right, so it's safe to say the account is suspended
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCOUNT_SUSPENDED)

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
        send_code(user, db)


def _find_login(identifier: str, db: Session) -> User | None:
    """The account an email or username on the login form belongs to."""
    identifier = identifier.strip()
    # usernames are all lowercase, so "Khaled05" still finds khaled05
    return db.query(User).filter(or_(User.email == identifier, User.username == identifier.lower())).first()


def _set_password(user: User, password: str) -> None:
    """Saves a new password and ends every login made before it."""
    user.hashed_password = get_password_hash(password)
    user.password_changed_at = utc_now()


def _send_password_changed(user_id: int) -> None:
    """Runs after the response; a failed notice doesn't undo the change."""
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        # a test account has no real email
        if user and not user.is_test:
            send_password_changed_email(user)
    except (smtplib.SMTPException, OSError):
        logger.exception("Couldn't send the password-changed email to user %s", user_id)
    finally:
        db.close()


def _send_reset_code(identifier: str) -> None:
    """Emails a reset code to the account, unless one was sent within the cooldown.
    Runs after the response, so a real and an unknown account take the same time to answer."""
    db = SessionLocal()
    try:
        user = _find_login(identifier, db)
        # only accounts that can log in and have a real email; one never verified finishes sign-up by logging in instead
        if not user or user.is_system or user.is_test or user.is_banned or not user.is_verified:
            return
        now = utc_now()
        if user.reset_sent_at and now - user.reset_sent_at < timedelta(seconds=config.OTP_RESEND_COOLDOWN_SECONDS):
            return

        code = f"{secrets.randbelow(1_000_000):06d}"
        try:
            send_password_reset_email(user, code)
        except (smtplib.SMTPException, OSError):
            logger.exception("Couldn't send a password reset code to user %s", user.id)
            return

        # saved only once sent, so a failed send doesn't start the cooldown
        user.reset_hash = get_password_hash(code)
        user.reset_sent_at = now
        user.reset_expires_at = now + timedelta(minutes=config.OTP_EXPIRE_MINUTES)
        user.reset_attempts = 0
        db.commit()
    finally:
        db.close()


# always 204, so it can't be used to find out which emails have accounts
@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(data: PasswordResetRequest, background_tasks: BackgroundTasks):
    if not smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset isn't available right now",
        )
    if data.identifier.strip():
        background_tasks.add_task(_send_reset_code, data.identifier)


@router.post("/reset-password")
def reset_password(data: PasswordReset, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Checks the emailed code; on success the password is changed, other sessions end, and this one is logged in."""
    user = _find_login(data.identifier, db)
    # the same answer as a wrong code, so it doesn't tell which accounts exist
    if not user or user.is_system or not user.reset_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    if user.reset_attempts >= config.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many attempts")
    if utc_now() > user.reset_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code expired")

    if not verify_password(data.code.strip(), user.reset_hash):
        user.reset_attempts += 1
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")
    # the code was right, so it's safe to say the account is suspended
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCOUNT_SUSPENDED)

    _set_password(user, data.new_password)
    user.reset_hash = None
    user.reset_sent_at = None
    user.reset_expires_at = None
    user.reset_attempts = 0
    db.commit()
    background_tasks.add_task(_send_password_changed, user.id)

    return {
        "access_token": create_access_token(data={"sub": str(user.id)}),
        "token_type": "bearer",
    }


# logs in with email or username and password; unverified, banned or turned-off accounts are refused
@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):

    user = _find_login(form_data.username, db)

    # the hidden admin account answers like an unknown account
    if not user or user.is_system or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # the password was right, so it's safe to say the account is suspended
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=ACCOUNT_SUSPENDED)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=TEST_ACCOUNT_OFF)

    # the password was right, so it's safe to say which email the code goes to
    if not user.is_verified:
        try:
            send_code(user, db)
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


# the logged-in student's own account
@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# the password is the only account detail a user can change
@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    password_data: PasswordChange,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # the admin panel owns a test account's password, so it can show it
    if current_user.is_test:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=TEST_ACCOUNT_NOT_ALLOWED)
    # 400 rather than 401: the client treats any 401 as an expired session and logs out
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # this logs out every session, the one that made the change too; the app then asks to log in again
    _set_password(current_user, password_data.new_password)
    db.commit()
    background_tasks.add_task(_send_password_changed, current_user.id)
