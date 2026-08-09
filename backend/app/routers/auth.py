import hashlib
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.config import get_settings
from app.deps import Session, get_current_session, get_owner_db, set_session_cookie
from app.rate_limit import clear_attempts, is_rate_limited, register_failed_attempt
from app.schemas.auth import (
    SECURITY_QUESTIONS,
    ChangePasswordRequest,
    ChangeSecurityQuestionRequest,
    ForgotPasswordQuestionRequest,
    ForgotPasswordQuestionResponse,
    ForgotPasswordResetRequest,
    LoginRequest,
    SessionResponse,
    SetupAccountRequest,
    SignupRequest,
    UpdateBirthdateRequest,
    UpdateHouseholdNameRequest,
)
from app.security import (
    SESSION_COOKIE_NAME,
    create_session_token,
    decrypt_pii,
    encrypt_pii,
    hash_secret,
    hash_username,
    verify_secret,
)

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_LOGIN_ERROR = "Username or password is incorrect."
GENERIC_RESET_ERROR = "That didn't match our records."
RATE_LIMIT_ERROR = "Too many attempts. Please wait a while and try again."


def _client_key(request: Request, username: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{username.lower()}:{ip}"


def _decoy_question(username: str) -> str:
    idx = int(hashlib.sha256(username.lower().encode()).hexdigest(), 16) % len(SECURITY_QUESTIONS)
    return SECURITY_QUESTIONS[idx]


def _to_session_response(
    household_id: str,
    household_name: str,
    username: str,
    expires_at: int,
    birthdate: date | None = None,
) -> SessionResponse:
    settings = get_settings()
    return SessionResponse(
        household_name=household_name,
        username=username,
        session_expires_at=expires_at,
        is_owner=bool(settings.owner_household_id) and household_id == settings.owner_household_id,
        birthdate=birthdate,
    )


def _decrypt_birthdate(birthdate_encrypted: str | None) -> date | None:
    decrypted = decrypt_pii(birthdate_encrypted)
    return date.fromisoformat(decrypted) if decrypted else None


@router.post("/login", response_model=SessionResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    conn: Connection = Depends(get_owner_db),
) -> SessionResponse:
    key = _client_key(request, payload.username)
    if is_rate_limited(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMIT_ERROR)

    row = conn.execute(
        text(
            "select household_id, household_name, password_hash, status, birthdate_encrypted "
            "from users where username_lookup_hash = :username_hash"
        ),
        {"username_hash": hash_username(payload.username)},
    ).mappings().first()

    if row is None:
        verify_secret(payload.password, None)
        register_failed_attempt(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    if row["status"] != "active":
        register_failed_attempt(key)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="This invite hasn't been set up yet."
        )

    if not verify_secret(payload.password, row["password_hash"]):
        register_failed_attempt(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    clear_attempts(key)
    token, expires_at = create_session_token(str(row["household_id"]), payload.username)
    set_session_cookie(response, token)
    return _to_session_response(
        str(row["household_id"]),
        decrypt_pii(row["household_name"]),
        payload.username,
        expires_at,
        _decrypt_birthdate(row["birthdate_encrypted"]),
    )


@router.post("/setup", response_model=SessionResponse)
def setup_account(
    payload: SetupAccountRequest,
    response: Response,
    conn: Connection = Depends(get_owner_db),
) -> SessionResponse:
    if payload.password != payload.confirm_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Passwords do not match.")

    row = conn.execute(
        text("select household_id, household_name, status from users where username_lookup_hash = :username_hash"),
        {"username_hash": hash_username(payload.username)},
    ).mappings().first()

    if row is None or row["status"] != "invited":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="This invite link is invalid or has already been used.",
        )

    conn.execute(
        text(
            """
            update users
            set password_hash = :password_hash,
                security_question = :security_question,
                security_answer_hash = :security_answer_hash,
                birthdate_encrypted = :birthdate_encrypted,
                status = 'active'
            where household_id = :household_id
            """
        ),
        {
            "password_hash": hash_secret(payload.password),
            "security_question": payload.security_question,
            "security_answer_hash": hash_secret(payload.security_answer.strip().lower()),
            "birthdate_encrypted": encrypt_pii(payload.birthdate.isoformat()) if payload.birthdate else None,
            "household_id": row["household_id"],
        },
    )

    token, expires_at = create_session_token(str(row["household_id"]), payload.username)
    set_session_cookie(response, token)
    return _to_session_response(
        str(row["household_id"]), decrypt_pii(row["household_name"]), payload.username, expires_at, payload.birthdate
    )


@router.post("/signup", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    conn: Connection = Depends(get_owner_db),
) -> SessionResponse:
    key = f"signup:{request.client.host if request.client else 'unknown'}"
    if is_rate_limited(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMIT_ERROR)

    if payload.password != payload.confirm_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Passwords do not match.")

    username_hash = hash_username(payload.username)
    existing = conn.execute(
        text("select 1 from users where username_lookup_hash = :username_hash"), {"username_hash": username_hash}
    ).first()
    if existing:
        register_failed_attempt(key)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="That username is already taken.")

    household_id = uuid.uuid4()
    conn.execute(
        text(
            """
            insert into users
                (household_id, household_name, username_lookup_hash, username_encrypted,
                 password_hash, security_question, security_answer_hash, birthdate_encrypted, status)
            values
                (:household_id, :household_name, :username_hash, :username_encrypted,
                 :password_hash, :security_question, :security_answer_hash, :birthdate_encrypted, 'active')
            """
        ),
        {
            "household_id": household_id,
            "household_name": encrypt_pii(payload.household_name),
            "username_hash": username_hash,
            "username_encrypted": encrypt_pii(payload.username),
            "password_hash": hash_secret(payload.password),
            "security_question": payload.security_question,
            "security_answer_hash": hash_secret(payload.security_answer.strip().lower()),
            "birthdate_encrypted": encrypt_pii(payload.birthdate.isoformat()) if payload.birthdate else None,
        },
    )

    clear_attempts(key)
    token, expires_at = create_session_token(str(household_id), payload.username)
    set_session_cookie(response, token)
    return _to_session_response(
        str(household_id), payload.household_name, payload.username, expires_at, payload.birthdate
    )


@router.post("/forgot-password/question", response_model=ForgotPasswordQuestionResponse)
def forgot_password_question(
    payload: ForgotPasswordQuestionRequest,
    conn: Connection = Depends(get_owner_db),
) -> ForgotPasswordQuestionResponse:
    row = conn.execute(
        text(
            "select security_question from users "
            "where username_lookup_hash = :username_hash and status = 'active'"
        ),
        {"username_hash": hash_username(payload.username)},
    ).mappings().first()

    question = row["security_question"] if row and row["security_question"] else _decoy_question(payload.username)
    return ForgotPasswordQuestionResponse(security_question=question)


@router.post("/forgot-password/reset", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password_reset(
    payload: ForgotPasswordResetRequest,
    request: Request,
    conn: Connection = Depends(get_owner_db),
) -> None:
    key = _client_key(request, payload.username)
    if is_rate_limited(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMIT_ERROR)

    row = conn.execute(
        text(
            "select household_id, security_answer_hash from users "
            "where username_lookup_hash = :username_hash and status = 'active'"
        ),
        {"username_hash": hash_username(payload.username)},
    ).mappings().first()

    answer_hash = row["security_answer_hash"] if row else None
    if not verify_secret(payload.security_answer.strip().lower(), answer_hash):
        register_failed_attempt(key)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=GENERIC_RESET_ERROR)

    clear_attempts(key)
    conn.execute(
        text("update users set password_hash = :password_hash where household_id = :household_id"),
        {"password_hash": hash_secret(payload.new_password), "household_id": row["household_id"]},
    )


@router.get("/me", response_model=SessionResponse)
def me(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_owner_db),
) -> SessionResponse:
    row = conn.execute(
        text("select household_name, birthdate_encrypted from users where household_id = :household_id"),
        {"household_id": session.household_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return _to_session_response(
        session.household_id,
        decrypt_pii(row["household_name"]),
        session.username,
        session.expires_at,
        _decrypt_birthdate(row["birthdate_encrypted"]),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_owner_db),
) -> None:
    row = conn.execute(
        text("select password_hash from users where household_id = :household_id"),
        {"household_id": session.household_id},
    ).mappings().first()
    if not verify_secret(payload.current_password, row["password_hash"] if row else None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    conn.execute(
        text("update users set password_hash = :password_hash where household_id = :household_id"),
        {"password_hash": hash_secret(payload.new_password), "household_id": session.household_id},
    )


@router.post("/change-security-question", status_code=status.HTTP_204_NO_CONTENT)
def change_security_question(
    payload: ChangeSecurityQuestionRequest,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_owner_db),
) -> None:
    row = conn.execute(
        text("select password_hash from users where household_id = :household_id"),
        {"household_id": session.household_id},
    ).mappings().first()
    if not verify_secret(payload.current_password, row["password_hash"] if row else None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    conn.execute(
        text(
            "update users set security_question = :question, security_answer_hash = :answer_hash "
            "where household_id = :household_id"
        ),
        {
            "question": payload.security_question,
            "answer_hash": hash_secret(payload.security_answer.strip().lower()),
            "household_id": session.household_id,
        },
    )


@router.patch("/household-name", response_model=SessionResponse)
def update_household_name(
    payload: UpdateHouseholdNameRequest,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_owner_db),
) -> SessionResponse:
    conn.execute(
        text("update users set household_name = :name where household_id = :household_id"),
        {"name": encrypt_pii(payload.household_name), "household_id": session.household_id},
    )
    row = conn.execute(
        text("select birthdate_encrypted from users where household_id = :household_id"),
        {"household_id": session.household_id},
    ).mappings().first()
    return _to_session_response(
        session.household_id,
        payload.household_name,
        session.username,
        session.expires_at,
        _decrypt_birthdate(row["birthdate_encrypted"]) if row else None,
    )


@router.patch("/birthdate", response_model=SessionResponse)
def update_birthdate(
    payload: UpdateBirthdateRequest,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_owner_db),
) -> SessionResponse:
    conn.execute(
        text("update users set birthdate_encrypted = :birthdate where household_id = :household_id"),
        {
            "birthdate": encrypt_pii(payload.birthdate.isoformat()) if payload.birthdate else None,
            "household_id": session.household_id,
        },
    )
    row = conn.execute(
        text("select household_name from users where household_id = :household_id"),
        {"household_id": session.household_id},
    ).mappings().first()
    return _to_session_response(
        session.household_id,
        decrypt_pii(row["household_name"]) if row else session.username,
        session.username,
        session.expires_at,
        payload.birthdate,
    )
