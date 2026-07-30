"""
Seed a demo household directly into the real Supabase project (owner/postgres role, so RLS
doesn't apply here — this mirrors how the admin invite path works, not a tenant request).

Creates: one household/user row (status='invited', so you go through the normal
"set up your account" flow yourself), six accounts spanning asset/liability types
(including one Type-2 SCD rename and one closed account), two people's income history
(including a raise and a job change), and ~3 years of monthly balance snapshots with
varying staleness so the Overview/Update-balances staleness banner has something to show.

Also (re)writes scripts/sample_everydollar_export.csv, a CSV in the EveryDollar export
format for exercising the CSV import pipeline — including one deliberately malformed row
and a couple of likely-duplicate-looking rows, matching the wireframe's example data.

Usage (from backend/, nestworth conda env active):
    python scripts/seed.py
"""

import csv
import os
import random
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

random.seed(42)

# Fixed "today" for reproducible-looking demo data.
TODAY = date(2026, 7, 29)
HISTORY_YEARS = 3


def months_between(start: date, end: date) -> list[date]:
    """End-of-month dates from start to end, inclusive-ish."""
    dates = []
    d = date(start.year, start.month, 1)
    while d <= end:
        # last day of month d
        if d.month == 12:
            last_day = date(d.year, 12, 31)
        else:
            last_day = date(d.year, d.month + 1, 1) - timedelta(days=1)
        if start <= last_day <= end:
            dates.append(last_day)
        d = (date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1))
    return dates


def snapshot_dates(account_start: date, stale_days: int) -> list[date]:
    history_start = max(account_start, date(TODAY.year - HISTORY_YEARS, TODAY.month, 1))
    cutoff = TODAY - timedelta(days=stale_days)
    return [d for d in months_between(history_start, TODAY) if d <= cutoff]


def growth_series(dates: list[date], start_value: float, monthly_rate: float, noise: float) -> list[float]:
    values = []
    v = start_value
    for _ in dates:
        v *= 1 + monthly_rate + random.uniform(-noise, noise)
        values.append(round(v, 2))
    return values


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set in backend/.env", file=sys.stderr)
        sys.exit(1)

    household_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    if database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgresql://") :]
    engine = create_engine(database_url)

    accounts = [
        # key, balance_type, institution, category, account_type, name, start, end, start_value, monthly_rate, noise, stale_days
        ("chase_checking", "asset", "Chase", "Banking", "Checking", "Chase Checking",
         date(2015, 6, 1), date(9999, 12, 31), 4200, 0.002, 0.08, 0),
        ("ally_savings", "asset", "Ally", "Banking", "Savings", "Ally Savings",
         date(2018, 2, 1), date(9999, 12, 31), 18000, 0.003, 0.02, 41),
        ("fidelity_taxable", "asset", "Fidelity", "Investments", "Brokerage", "Fidelity Taxable",
         date(2016, 1, 1), date(2019, 3, 1), 12000, 0.008, 0.03, None),  # closed SCD predecessor
        ("joint_brokerage", "asset", "Fidelity", "Investments", "Brokerage", "Joint Brokerage",
         date(2019, 3, 1), date(9999, 12, 31), 41000, 0.009, 0.03, 108),
        ("roth_ira", "asset", "Vanguard", "Retirement", "Roth IRA", "Roth IRA",
         date(2017, 1, 1), date(9999, 12, 31), 22000, 0.008, 0.025, 15),
        ("mortgage", "liability", "Wells Fargo", "Property", "Mortgage", "Mortgage",
         date(2020, 8, 1), date(9999, 12, 31), 385000, -0.0025, 0.001, 94),
        ("old_amex", "liability", "Amex", "Credit", "Credit", "Old Amex",
         date(2014, 1, 1), date(2021, 11, 1), 3200, 0.0, 0.05, None),  # closed
    ]

    account_ids: dict[str, str] = {key: str(uuid.uuid4()) for key, *_ in accounts}

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into users (user_id, household_id, household_name, username, status)
                values (:user_id, :household_id, :household_name, :username, 'invited')
                """
            ),
            {
                "user_id": user_id,
                "household_id": household_id,
                "household_name": "The Harts",
                "username": "harts",
            },
        )

        for key, balance_type, institution, category, account_type, name, start, end, *_ in accounts:
            conn.execute(
                text(
                    """
                    insert into accounts
                        (account_id, household_id, balance_type, institution_name, category,
                         account_type, account_name, effective_start_date, effective_end_date)
                    values
                        (:account_id, :household_id, :balance_type, :institution_name, :category,
                         :account_type, :account_name, :start, :end)
                    """
                ),
                {
                    "account_id": account_ids[key],
                    "household_id": household_id,
                    "balance_type": balance_type,
                    "institution_name": institution,
                    "category": category,
                    "account_type": account_type,
                    "account_name": name,
                    "start": start,
                    "end": end,
                },
            )

        income_records = [
            ("Dana", "Acme Co", Decimal("145000.00"), date(2021, 1, 1), date(2024, 4, 1)),
            ("Dana", "Acme Co", Decimal("165000.00"), date(2024, 4, 1), date(9999, 12, 31)),
            ("Ross", "Gamma Inc", Decimal("84000.00"), date(2019, 6, 1), date(2023, 8, 31)),
            ("Ross", "Beta LLC", Decimal("98000.00"), date(2023, 9, 1), date(9999, 12, 31)),
        ]
        for individual, company, income, start, end in income_records:
            conn.execute(
                text(
                    """
                    insert into income
                        (income_id, household_id, individual, company, income,
                         effective_start_date, effective_end_date)
                    values
                        (:income_id, :household_id, :individual, :company, :income, :start, :end)
                    """
                ),
                {
                    "income_id": str(uuid.uuid4()),
                    "household_id": household_id,
                    "individual": individual,
                    "company": company,
                    "income": income,
                    "start": start,
                    "end": end,
                },
            )

        balance_rows = 0
        for row in accounts:
            key, balance_type, institution, category, account_type, name, start, end, start_value, monthly_rate, noise, stale_days = row
            if stale_days is None:
                # closed account: full lifespan, not clipped to the rolling HISTORY_YEARS
                # window from today (a closed account's whole history usually predates it).
                dates = [d for d in months_between(start, min(end, TODAY)) if d < end]
            else:
                dates = snapshot_dates(start, stale_days)
            values = growth_series(dates, start_value, monthly_rate, noise)
            for d, v in zip(dates, values):
                conn.execute(
                    text(
                        """
                        insert into balances (balance_id, household_id, account_id, full_date, balance)
                        values (:balance_id, :household_id, :account_id, :full_date, :balance)
                        on conflict (account_id, full_date) do nothing
                        """
                    ),
                    {
                        "balance_id": str(uuid.uuid4()),
                        "household_id": household_id,
                        "account_id": account_ids[key],
                        "full_date": d,
                        "balance": abs(v),
                    },
                )
                balance_rows += 1

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

    write_sample_csv()

    print("Seed complete.")
    print(f"  household_id (set as OWNER_HOUSEHOLD_ID): {household_id}")
    print("  username: harts")
    print(f"  accounts: {len(accounts)}, income records: {len(income_records)}, balance rows: {balance_rows}")
    print("  Go to /setup in the app and activate this household to log in.")


def write_sample_csv() -> None:
    path = BACKEND_DIR / "scripts" / "sample_everydollar_export.csv"
    rows = [
        ["Group", "Item", "Type", "Date", "Merchant", "Account", "Amount", "Note"],
        ["Income", "Paycheck", "income", "06/03/2026", "Acme Co", "Chase •1234", "6875.00", ""],
        ["Food", "Groceries", "expense", "06/02/2026", "Kroger", "Chase •1234", "-142.36", ""],
        ["Food", "Restaurants", "expense", "06/04/2026", "Chipotle", "Chase •1234", "-31.20", ""],
        ["Housing", "Mortgage", "expense", "06/05/2026", "Wells Fargo", "Chase •1234", "-2450.00", ""],
        ["Transport", "Gas", "expense", "06/08/2026", "Shell", "Amex •9002", "-52.10", ""],
        ["Transport", "Auto Insurance", "expense", "06/10/2026", "Geico", "Chase •1234", "-118.00", ""],
        ["Fun", "Streaming", "expense", "06/12/2026", "Netflix", "Amex •9002", "-15.49", ""],
        ["Food", "Groceries", "expense", "06/16/2026", "Kroger", "Chase •1234", "-98.44", ""],
        ["Income", "Paycheck", "income", "06/17/2026", "Beta LLC", "Chase •1234", "4083.00", ""],
        ["Fun", "Dining", "expense", "06/07/2026", "Local Bistro", "", "12.5o", ""],  # malformed amount
    ]
    with path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)


if __name__ == "__main__":
    main()
