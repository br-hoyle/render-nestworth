"""
Two Postgres connection pools, matching the RLS pattern documented in
docs/SETUP_SUPABASE.md:

- `owner_engine` connects as the Supabase owner/service role (bypasses RLS). Used only for
  the pre-session auth lookups (login/setup/forgot-password by username) and admin invite
  creation — there is no household session yet at that point, so there is nothing to scope.

- `tenant_engine` connects as the restricted `app_user` role, which has
  FORCE ROW LEVEL SECURITY applied on every tenant-data table. Every household-scoped
  request opens ONE transaction on this engine, runs
  `SELECT set_config('app.current_household_id', :hid, true)` (the trailing `true` makes it
  local to the transaction — safe to reuse pooled connections across requests), then the
  real query, then commits. Even if application code forgets a `WHERE household_id = ...`
  clause, the database itself blocks cross-household reads/writes.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import Connection

from app.config import get_settings

_owner_engine: Engine | None = None
_tenant_engine: Engine | None = None


def psycopg3_dsn(url: str) -> str:
    """We install psycopg (v3), not psycopg2 — SQLAlchemy defaults a bare
    `postgresql://` URL to psycopg2, so force the psycopg3 dialect explicitly."""
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def get_owner_engine() -> Engine:
    global _owner_engine
    if _owner_engine is None:
        _owner_engine = create_engine(
            psycopg3_dsn(get_settings().database_url), pool_pre_ping=True
        )
    return _owner_engine


def get_tenant_engine() -> Engine:
    global _tenant_engine
    if _tenant_engine is None:
        _tenant_engine = create_engine(
            psycopg3_dsn(get_settings().effective_tenant_database_url), pool_pre_ping=True
        )
    return _tenant_engine


@contextmanager
def owner_conn() -> Iterator[Connection]:
    engine = get_owner_engine()
    with engine.begin() as conn:
        yield conn


@contextmanager
def tenant_conn(household_id: str) -> Iterator[Connection]:
    engine = get_tenant_engine()
    with engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.current_household_id', :hid, true)"),
            {"hid": household_id},
        )
        yield conn
