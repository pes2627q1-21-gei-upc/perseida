"""Per-user cap on simultaneous WebSocket connections. TG-63 (review PR #78)."""

import pytest

from app.application.realtime.connection_limiter import ConnectionLimiter


def test_a_user_can_open_connections_up_to_the_limit() -> None:
    limiter = ConnectionLimiter(max_per_user=2)

    assert limiter.try_acquire("u1") is True
    assert limiter.try_acquire("u1") is True


def test_a_connection_over_the_limit_is_refused() -> None:
    limiter = ConnectionLimiter(max_per_user=2)
    limiter.try_acquire("u1")
    limiter.try_acquire("u1")

    assert limiter.try_acquire("u1") is False


def test_a_refused_connection_does_not_use_a_slot() -> None:
    limiter = ConnectionLimiter(max_per_user=1)
    limiter.try_acquire("u1")
    limiter.try_acquire("u1")

    limiter.release("u1")

    assert limiter.try_acquire("u1") is True


def test_releasing_a_connection_frees_a_slot() -> None:
    limiter = ConnectionLimiter(max_per_user=1)
    limiter.try_acquire("u1")

    limiter.release("u1")

    assert limiter.try_acquire("u1") is True


def test_the_limit_is_per_user() -> None:
    limiter = ConnectionLimiter(max_per_user=1)
    limiter.try_acquire("u1")

    assert limiter.try_acquire("u2") is True


def test_releasing_a_user_without_connections_is_harmless() -> None:
    limiter = ConnectionLimiter(max_per_user=1)

    limiter.release("nobody")

    assert limiter.try_acquire("nobody") is True
    assert limiter.try_acquire("nobody") is False


def test_the_registry_does_not_keep_users_without_connections() -> None:
    limiter = ConnectionLimiter(max_per_user=2)
    limiter.try_acquire("u1")
    limiter.release("u1")

    assert limiter.active_users == 0


@pytest.mark.parametrize("value", [0, -1])
def test_the_limit_must_be_positive(value: int) -> None:
    with pytest.raises(ValueError, match="max_per_user"):
        ConnectionLimiter(max_per_user=value)
