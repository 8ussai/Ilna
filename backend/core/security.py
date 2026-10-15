import re
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from backend.backendConfig import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# same rules as frontend/src/password.ts
PASSWORD_RULES = [
    (lambda p: len(p) >= 8, "at least 8 characters"),
    (lambda p: re.search(r"[a-z]", p), "a lowercase letter"),
    (lambda p: re.search(r"[A-Z]", p), "an uppercase letter"),
    (lambda p: re.search(r"[0-9]", p), "a number"),
    (lambda p: re.search(r"[^A-Za-z0-9\s]", p), "a symbol"),
]


def check_password_strength(password: str) -> None:
    missing = [label for test, label in PASSWORD_RULES if not test(password)]
    if missing:
        raise ValueError("Password needs " + ", ".join(missing) + ".")


def create_access_token(data: dict) -> str:
    payload = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({"exp": expire})

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)