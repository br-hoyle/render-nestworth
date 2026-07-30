import time

import jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# A precomputed hash of a value nobody will ever guess, used so that verifying a login
# against a *nonexistent* username still takes the same time as a real bcrypt compare
# (defends against timing-based username enumeration).
_DUMMY_HASH = pwd_context.hash("this-is-not-a-real-password-do-not-use")

SESSION_COOKIE_NAME = "nw_session"


def hash_secret(value: str) -> str:
    return pwd_context.hash(value)


def verify_secret(value: str, hashed: str | None) -> bool:
    """Timing-safe verify. Pass hashed=None when the record wasn't found at all, so the
    same bcrypt work happens either way and the response time doesn't leak existence."""
    if hashed is None:
        pwd_context.verify(value, _DUMMY_HASH)
        return False
    return pwd_context.verify(value, hashed)


def create_session_token(household_id: str, username: str) -> tuple[str, int]:
    settings = get_settings()
    now = int(time.time())
    expires_at = now + settings.session_timeout_seconds
    payload = {
        "household_id": household_id,
        "username": username,
        "iat": now,
        "last_activity": now,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return token, expires_at


def refresh_session_token(payload: dict) -> tuple[str, int]:
    settings = get_settings()
    now = int(time.time())
    expires_at = now + settings.session_timeout_seconds
    new_payload = {**payload, "last_activity": now}
    token = jwt.encode(new_payload, settings.jwt_secret, algorithm="HS256")
    return token, expires_at


def decode_session_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None

    now = int(time.time())
    if now - payload.get("last_activity", 0) > settings.session_timeout_seconds:
        return None
    return payload
