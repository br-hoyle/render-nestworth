import time

from app.rate_limit import clear_attempts, is_rate_limited, register_failed_attempt
from app.security import (
    create_session_token,
    decode_session_token,
    hash_secret,
    refresh_session_token,
    verify_secret,
)


def test_hash_and_verify_roundtrip():
    hashed = hash_secret("correct horse battery staple")
    assert verify_secret("correct horse battery staple", hashed) is True
    assert verify_secret("wrong", hashed) is False


def test_verify_secret_handles_missing_hash_without_raising():
    # No user found — must still run bcrypt work and return False, not raise.
    assert verify_secret("anything", None) is False


def test_session_token_roundtrip():
    token, expires_at = create_session_token("household-123", "harts")
    payload = decode_session_token(token)
    assert payload is not None
    assert payload["household_id"] == "household-123"
    assert payload["username"] == "harts"
    assert expires_at > time.time()


def test_decode_rejects_tampered_token():
    token, _ = create_session_token("household-123", "harts")
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert decode_session_token(tampered) is None


def test_refresh_extends_expiry():
    token, expires_at = create_session_token("household-123", "harts")
    payload = decode_session_token(token)
    time.sleep(1)
    new_token, new_expires_at = refresh_session_token(payload)
    new_payload = decode_session_token(new_token)
    assert new_payload["last_activity"] > payload["last_activity"]
    assert new_expires_at >= expires_at


def test_rate_limit_locks_after_threshold():
    key = "test-rate-limit-key"
    clear_attempts(key)
    for _ in range(8):  # matches app.rate_limit._MAX_ATTEMPTS
        assert is_rate_limited(key) is False
        register_failed_attempt(key)
    assert is_rate_limited(key) is True
    clear_attempts(key)
    assert is_rate_limited(key) is False
