import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_owner_db, require_owner
from app.schemas.admin import CreateInviteRequest, InviteListItem, InviteResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/invites", response_model=list[InviteListItem])
def list_invites(
    _: Session = Depends(require_owner),
    conn: Connection = Depends(get_owner_db),
) -> list[InviteListItem]:
    rows = conn.execute(
        text("select household_id, household_name, username, status from users order by created_date desc")
    ).mappings().all()
    return [InviteListItem(**row) for row in rows]


@router.post("/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: CreateInviteRequest,
    _: Session = Depends(require_owner),
    conn: Connection = Depends(get_owner_db),
) -> InviteResponse:
    existing = conn.execute(
        text("select 1 from users where username = :username"), {"username": payload.username}
    ).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="That username is already taken.")

    household_id = str(uuid.uuid4())
    conn.execute(
        text(
            """
            insert into users (household_id, household_name, username, status)
            values (:household_id, :household_name, :username, 'invited')
            """
        ),
        {
            "household_id": household_id,
            "household_name": payload.household_name,
            "username": payload.username,
        },
    )
    return InviteResponse(
        household_id=household_id,
        household_name=payload.household_name,
        username=payload.username,
        status="invited",
    )
