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

    with engine.begin() as conn:
        existing = conn.execute(
            text("select 1 from users where username = :username"), {"username": args.username}
        ).first()
        if existing:
            print(f"Username '{args.username}' already exists.", file=sys.stderr)
            sys.exit(1)

        conn.execute(
            text(
                """
                insert into users (household_id, household_name, username, status)
                values (:household_id, :household_name, :username, 'invited')
                """
            ),
            {
                "household_id": household_id,
                "household_name": args.household_name,
                "username": args.username,
            },
        )

    print(f"Invited '{args.household_name}' as username '{args.username}'.")
    print(f"household_id: {household_id}")
    print("They can now visit /setup and activate the account.")


if __name__ == "__main__":
    main()
