"""
Local-dev convenience runner for sql/schema.sql against the real Supabase project.

Reads DATABASE_URL (owner/postgres role) from backend/.env. If APP_USER_PASSWORD is also
set in .env, it's substituted for the placeholder password in the `create role app_user`
statement so you don't have to hand-edit the SQL file; otherwise a random password is
generated and printed once (save it — it's used to build TENANT_DATABASE_URL).

Usage (from backend/, with the nestworth conda env active):
    python scripts/apply_schema.py
"""

import os
import secrets
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set in backend/.env — nothing to do.", file=sys.stderr)
        sys.exit(1)

    schema_sql = (BACKEND_DIR / "sql" / "schema.sql").read_text()

    app_user_password = os.environ.get("APP_USER_PASSWORD")
    generated = False
    if not app_user_password:
        app_user_password = secrets.token_urlsafe(24)
        generated = True

    schema_sql = schema_sql.replace("CHANGE_ME_STRONG_PASSWORD", app_user_password)

    print("Connecting to Supabase and applying schema.sql ...")
    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from pg_catalog.pg_roles where rolname = 'app_user'")
            role_existed_already = cur.fetchone() is not None
            cur.execute(schema_sql)
    print("Schema applied successfully.")

    if generated and not role_existed_already:
        print("\nGenerated app_user password (save this for TENANT_DATABASE_URL):")
        print(f"  {app_user_password}")
        print(
            "\nBuild TENANT_DATABASE_URL by taking your DATABASE_URL and swapping the "
            "username to app_user and the password to the one above, e.g.:\n"
            "  postgresql://app_user:<password>@<host>:<port>/postgres"
        )
    elif role_existed_already:
        print("\napp_user already existed — its password is unchanged; TENANT_DATABASE_URL in .env is still valid.")


if __name__ == "__main__":
    main()
