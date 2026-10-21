import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken
from jose import jwt
from passlib.context import CryptContext

from backend.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ADMIN_SESSION_MINUTES,
    ALGORITHM,
    SECRET_KEY,
)

# the claim that marks an admin login; student tokens never have it
ADMIN_SCOPE = "admin"


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# a bcrypt hash of a password or code
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# whether a password or code matches its bcrypt hash
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# same rules as frontend/src/password.ts
PASSWORD_RULES = [
    (lambda p: len(p) >= 8, "at least 8 characters"),
    (lambda p: re.search(r"[a-z]", p), "a lowercase letter"),
    (lambda p: re.search(r"[A-Z]", p), "an uppercase letter"),
    (lambda p: re.search(r"[0-9]", p), "a number"),
    (lambda p: re.search(r"[!@#$%&]", p), "a symbol (! @ # $ % &)"),
]


# no look-alikes (0/O, 1/l/I), so a password read off the screen is typed right
_PASSWORD_LETTERS_LOWER = "abcdefghijkmnpqrstuvwxyz"
_PASSWORD_LETTERS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_PASSWORD_DIGITS = "23456789"
_PASSWORD_SYMBOLS = "!@#$%&"


def generate_password(length: int = 12) -> str:
    """A random password that meets PASSWORD_RULES: at least one of each kind, the rest mixed."""
    kinds = [_PASSWORD_LETTERS_LOWER, _PASSWORD_LETTERS_UPPER, _PASSWORD_DIGITS, _PASSWORD_SYMBOLS]
    every = "".join(kinds)
    chars = [secrets.choice(kind) for kind in kinds] + [secrets.choice(every) for _ in range(length - len(kinds))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


# the key test-account passwords are encrypted with, made from SECRET_KEY
def _fernet() -> Fernet:
    # a key of its own, made from SECRET_KEY; changing SECRET_KEY means stored test passwords can't be read back
    digest = hashlib.sha256(b"ilna-test-password:" + SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


# encrypts a test account's password so the admin panel can show it again
def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    """None if it can't be read, e.g. SECRET_KEY changed since it was saved."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# raises a ValueError listing the PASSWORD_RULES a password misses
def check_password_strength(password: str) -> None:
    missing = [label for test, label in PASSWORD_RULES if not test(password)]
    if missing:
        raise ValueError("Password needs " + ", ".join(missing) + ".")


# a student login token; iat lets a password change end older logins
def create_access_token(data: dict) -> str:
    payload = data.copy()

    now = datetime.now(timezone.utc)
    # iat is checked against User.password_changed_at, so a new password logs out older logins
    payload.update({"iat": int(now.timestamp()), "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)})

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# marks a test user's login opened from the admin panel, which may use the site while it's closed
MAINTENANCE_BYPASS = "maintenance_bypass"


def create_maintenance_bypass_token(user_id: int, expires_at: datetime) -> str:
    """A test user's login that gets past maintenance; it ends with the window it was made for (expires_at, UTC)."""
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "iat": int(now.timestamp()), "exp": expires_at, MAINTENANCE_BYPASS: True},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


# whether a token is a test user's maintenance-bypass login
def is_maintenance_bypass(token: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return False
    return payload.get(MAINTENANCE_BYPASS) is True


def create_admin_token() -> str:
    """A login for the one admin; its scope keeps it apart from student tokens."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ADMIN_SESSION_MINUTES)
    return jwt.encode({"sub": ADMIN_SCOPE, "scope": ADMIN_SCOPE, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
