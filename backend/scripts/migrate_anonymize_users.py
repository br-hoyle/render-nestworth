"""
One-time migration: anonymizes the `users` table in place.

Backfills `username_lookup_hash` (HMAC-SHA256, deterministic/one-way) and
`username_encrypted` + re-encrypts `household_name` (Fernet, reversible) for every existing
row, then finalizes the schema — adds the NOT NULL/UNIQUE constraints and drops the plaintext
`username` column. See backend/app/security.py for the hash_username/encrypt_pii/decrypt_pii
helpers this reuses, and sql/schema.sql for the target column shapes.

This is destructive and irreversible (the plaintext `username` column is dropped for good).
Back up the database (or run this against a Supabase branch/restored copy) before running it
for real. Safe to re-run: if the `username` column is already gone, it prints a message and
exits without touching anything.

Usage (from backend/, nestworth conda env active):
    python scripts/migrate_anonymize_users.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from app.security import encrypt_pii, hash_username  # noqa: E402


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set in backend/.env", file=sys.stderr)
        sys.exit(1)
    if database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgresql://") :]

    engine = create_engine(database_url)

    with engine.begin() as conn:
        has_username_column = conn.execute(
            text(
                "select 1 from information_schema.columns "
                "where table_name = 'users' and column_name = 'username'"
            )
        ).first()

        if has_username_column is None:
            print("Nothing to do — the plaintext `username` column is already gone.")
            return

        rows = conn.execute(text("select user_id, username, household_name from users")).mappings().all()

        print(f"Backfilling {len(rows)} row(s) ...")
        for row in rows:
            conn.execute(
                text(
                    """
                    update users
                    set username_lookup_hash = :username_hash,
                        username_encrypted = :username_encrypted,
                        household_name = :household_name
                    where user_id = :user_id
                    """
                ),
                {
                    "username_hash": hash_username(row["username"]),
                    "username_encrypted": encrypt_pii(row["username"]),
                    "household_name": encrypt_pii(row["household_name"]),
                    "user_id": row["user_id"],
                },
            )

        print("Finalizing schema (NOT NULL, UNIQUE, dropping plaintext username column) ...")
        conn.execute(text("alter table users alter column username_lookup_hash set not null"))
        conn.execute(text("alter table users alter column username_encrypted set not null"))
        conn.execute(
            text(
                "alter table users add constraint users_username_lookup_hash_key "
                "unique (username_lookup_hash)"
            )
        )
        conn.execute(text("alter table users drop column username"))

    print(f"Done. Migrated {len(rows)} row(s). The `users` table no longer stores any plaintext username.")


if __name__ == "__main__":
    confirm = input(
        "This permanently rewrites the `users` table (hashes/encrypts username and "
        "household_name, then drops the plaintext username column). Make sure you have a "
        "backup or are running against a copy of the database. Type 'yes' to continue: "
    )
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        sys.exit(0)
    main()
