"""
Forward-fill for irregular balance snapshots — the trickiest piece of business logic in
the app, per CLAUDE.md, so it's implemented as a pure, DB-free, unit-tested function
rather than a Postgres window function (vanilla Postgres has no IGNORE NULLS support the
way the spec's SQL hint assumes). Real snapshots are cheap to fetch per household (a
handful of accounts, at most one row per account per day), so doing this in Python is both
simpler and just as fast at this scale.

Rules:
- Never fabricate a balance before an account's first real snapshot.
- Never fabricate a balance after an account's effective_end_date (closed accounts stop).
- Every output point is tagged is_real so the UI can mark true snapshot dates on charts.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal


@dataclass(frozen=True)
class Snapshot:
    full_date: date
    balance: Decimal


@dataclass(frozen=True)
class FilledPoint:
    full_date: date
    balance: Decimal
    is_real: bool


def daily_dates(start: date, end: date) -> list[date]:
    if end < start:
        return []
    days = (end - start).days
    return [start + timedelta(days=i) for i in range(days + 1)]


def forward_fill_series(
    snapshots: list[Snapshot],
    query_dates: list[date],
    account_effective_end: date | None = None,
) -> list[FilledPoint]:
    """
    snapshots: real balance snapshots for one account, any order.
    query_dates: the dates to produce a value for (should be sorted ascending).
    account_effective_end: if set, no points are emitted after this date (exclusive of the
        sentinel "9999-12-31", which the caller should normalize to None/far-future).
    """
    sorted_snapshots = sorted(snapshots, key=lambda s: s.full_date)
    if not sorted_snapshots:
        return []

    first_real_date = sorted_snapshots[0].full_date
    by_date = {s.full_date: s.balance for s in sorted_snapshots}

    points: list[FilledPoint] = []
    last_value: Decimal | None = None
    snapshot_idx = 0

    for d in sorted(query_dates):
        if d < first_real_date:
            continue
        if account_effective_end is not None and d > account_effective_end:
            break

        # advance last_value to the most recent snapshot on or before d
        while snapshot_idx < len(sorted_snapshots) and sorted_snapshots[snapshot_idx].full_date <= d:
            last_value = sorted_snapshots[snapshot_idx].balance
            snapshot_idx += 1

        is_real = d in by_date
        points.append(FilledPoint(full_date=d, balance=last_value, is_real=is_real))

    return points


def staleness_days(last_real_date: date | None, as_of: date) -> int | None:
    """Days since the account's last real snapshot. None if there has never been one."""
    if last_real_date is None:
        return None
    return (as_of - last_real_date).days


def is_stale(last_real_date: date | None, as_of: date, threshold_days: int) -> bool:
    days = staleness_days(last_real_date, as_of)
    return days is None or days > threshold_days
