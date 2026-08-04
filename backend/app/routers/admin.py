import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_owner_db, require_owner
from app.schemas.admin import CreateInviteRequest, InviteListItem, InviteResponse
from app.security import decrypt_pii, encrypt_pii, hash_username

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/invites", response_model=list[InviteListItem])
def list_invites(
    _: Session = Depends(require_owner),
    conn: Connection = Depends(get_owner_db),
) -> list[InviteListItem]:
    rows = conn.execute(
        text(
            "select household_id, household_name, username_encrypted, status "
            "from users order by created_date desc"
        )
    ).mappings().all()
    return [
        InviteListItem(
            household_id=row["household_id"],
            household_name=decrypt_pii(row["household_name"]),
            username=decrypt_pii(row["username_encrypted"]),
            status=row["status"],
        )
        for row in rows
    ]


@router.post("/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: CreateInviteRequest,
    _: Session = Depends(require_owner),
    conn: Connection = Depends(get_owner_db),
) -> InviteResponse:
    username_hash = hash_username(payload.username)
    existing = conn.execute(
        text("select 1 from users where username_lookup_hash = :username_hash"), {"username_hash": username_hash}
    ).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="That username is already taken.")

    household_id = str(uuid.uuid4())
    conn.execute(
        text(
            """
            insert into users
                (household_id, household_name, username_lookup_hash, username_encrypted, status)
            values
                (:household_id, :household_name, :username_hash, :username_encrypted, 'invited')
            """
        ),
        {
            "household_id": household_id,
            "household_name": encrypt_pii(payload.household_name),
            "username_hash": username_hash,
            "username_encrypted": encrypt_pii(payload.username),
        },
    )
    return InviteResponse(
        household_id=household_id,
        household_name=payload.household_name,
        username=payload.username,
        status="invited",
    )
