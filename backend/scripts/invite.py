"""
CLI alternative to the admin /admin/invites page — creates an invited household directly
against the real Supabase project (owner/postgres role connection).

Usage (from backend/, nestworth conda env active):
    python scripts/invite.py --household-name "Nguyen family" --username nguyens
"""

import argparse
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from app.security import encrypt_pii, hash_username  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--household-name", required=True)
    parser.add_argument("--username", required=True)
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set in backend/.env", file=sys.stderr)
        sys.exit(1)
    if database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgresql://") :]

    engine = create_engine(database_url)
    household_id = str(uuid.uuid4())

    username_hash = hash_username(args.username)
    with engine.begin() as conn:
        existing = conn.execute(
            text("select 1 from users where username_lookup_hash = :username_hash"),
            {"username_hash": username_hash},
        ).first()
        if existing:
            print(f"Username '{args.username}' already exists.", file=sys.stderr)
            sys.exit(1)

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
                "household_name": encrypt_pii(args.household_name),
                "username_hash": username_hash,
                "username_encrypted": encrypt_pii(args.username),
            },
        )

    print(f"Invited '{args.household_name}' as username '{args.username}'.")
    print(f"household_id: {household_id}")
    print("They can now visit /setup and activate the account.")


if __name__ == "__main__":
    main()
