"""
In-process, per-key attempt counter for throttling login/reset abuse. Resets on backend
restart and isn't shared across multiple instances — an accepted simplification at this
app's scale (a handful of households), documented in docs/SETUP_RENDER.md.
"""

from cachetools import TTLCache

_MAX_ATTEMPTS = 8
_WINDOW_SECONDS = 15 * 60

_attempts: TTLCache = TTLCache(maxsize=10_000, ttl=_WINDOW_SECONDS)


def register_failed_attempt(key: str) -> None:
    _attempts[key] = _attempts.get(key, 0) + 1


def is_rate_limited(key: str) -> bool:
    return _attempts.get(key, 0) >= _MAX_ATTEMPTS


def clear_attempts(key: str) -> None:
    _attempts.pop(key, None)
