from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.deps import Session, get_current_session, get_tenant_db
from app.schemas.settings import HouseholdSettings, merge_with_defaults
from app.security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create_settings_row(conn: Connection, household_id: str) -> dict:
    conn.execute(
        text(
            """
            insert into household_settings (household_id, settings)
            values (:household_id, '{}'::jsonb)
            on conflict (household_id) do nothing
            """
        ),
        {"household_id": household_id},
    )
    row = conn.execute(
        text("select settings from household_settings where household_id = :household_id"),
        {"household_id": household_id},
    ).mappings().first()
    return row["settings"] if row else {}


@router.get("", response_model=HouseholdSettings)
def get_settings_route(
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> HouseholdSettings:
    stored = _get_or_create_settings_row(conn, session.household_id)
    return HouseholdSettings(**merge_with_defaults(stored))


@router.patch("", response_model=HouseholdSettings)
def update_settings_route(
    payload: dict,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> HouseholdSettings:
    stored = _get_or_create_settings_row(conn, session.household_id)
    merged = {**merge_with_defaults(stored), **payload}
    # Validate the merged result conforms to the known shape before persisting.
    validated = HouseholdSettings(**merged)
    conn.execute(
        text(
            """
            update household_settings
            set settings = cast(:settings as jsonb), updated_date = now()
            where household_id = :household_id
            """
        ),
        {"settings": validated.model_dump_json(), "household_id": session.household_id},
    )
    return validated


@router.delete("/household", status_code=status.HTTP_204_NO_CONTENT)
def delete_household(
    response: Response,
    session: Session = Depends(get_current_session),
    conn: Connection = Depends(get_tenant_db),
) -> None:
    """Irreversibly deletes every row this household owns, across all tables, then the
    household's own users row. Scoped by household_id on every statement — RLS backs this
    up as defense-in-depth on the tenant-data tables."""
    household_id = session.household_id
    for table in ["transactions", "balances", "scenarios", "income", "accounts", "household_settings"]:
        conn.execute(text(f"delete from {table} where household_id = :household_id"), {"household_id": household_id})
    conn.execute(text("delete from users where household_id = :household_id"), {"household_id": household_id})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
