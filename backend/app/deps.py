from collections.abc import Iterator
from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy.engine import Connection

from app.config import get_settings
from app.db import owner_conn, tenant_conn
from app.security import (
    SESSION_COOKIE_NAME,
    decode_session_token,
    refresh_session_token,
)


@dataclass
class Session:
    household_id: str
    username: str
    expires_at: int


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="none" if settings.cookie_secure else "lax",
        max_age=settings.session_timeout_seconds,
        path="/",
    )


def get_current_session(
    response: Response,
    nw_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Session:
    if nw_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")

    payload = decode_session_token(nw_session)
    if payload is None:
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    # Sliding expiry: every authenticated request that reaches here refreshes the window.
    new_token, expires_at = refresh_session_token(payload)
    set_session_cookie(response, new_token)

    return Session(
        household_id=payload["household_id"],
        username=payload["username"],
        expires_at=expires_at,
    )


def require_owner(session: Session = Depends(get_current_session)) -> Session:
    settings = get_settings()
    if not settings.owner_household_id or session.household_id != settings.owner_household_id:
        # 404, not 403 — a non-owner shouldn't learn this route exists at all.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return session


def get_tenant_db(
    session: Session = Depends(get_current_session),
) -> Iterator[Connection]:
    with tenant_conn(session.household_id) as conn:
        yield conn


def get_owner_db() -> Iterator[Connection]:
    with owner_conn() as conn:
        yield conn
