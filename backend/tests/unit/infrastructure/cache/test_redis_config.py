import pytest
from pydantic import ValidationError

from app.infrastructure.cache.config import RedisSettings


@pytest.fixture(autouse=True)
def _no_worker_redis_db(monkeypatch: pytest.MonkeyPatch) -> None:
    # Under pytest-xdist the test conftest sets REDIS_DB per worker (TG-362).
    monkeypatch.delenv("REDIS_DB", raising=False)


def test_redis_url_is_built_from_host_and_port() -> None:
    settings = RedisSettings(redis_host="cache", redis_port=6379, _env_file=None)

    assert settings.redis_url == "redis://cache:6379/0"


def test_default_ttl_is_one_hour() -> None:
    settings = RedisSettings(redis_host="cache", redis_port=6379, _env_file=None)

    assert settings.cache_default_ttl_seconds == 3600


def test_default_ttl_is_configurable_by_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_HOST", "localhost")
    monkeypatch.setenv("REDIS_PORT", "6380")
    monkeypatch.setenv("CACHE_DEFAULT_TTL_SECONDS", "120")

    settings = RedisSettings(_env_file=None)

    assert settings.redis_url == "redis://localhost:6380/0"
    assert settings.cache_default_ttl_seconds == 120


def test_missing_host_and_port_are_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_HOST", raising=False)
    monkeypatch.delenv("REDIS_PORT", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        RedisSettings(_env_file=None)

    missing = {str(error["loc"][0]) for error in exc_info.value.errors()}
    assert missing == {"redis_host", "redis_port"}


def test_socket_timeout_defaults_to_two_seconds() -> None:
    settings = RedisSettings(redis_host="cache", redis_port=6379, _env_file=None)

    assert settings.redis_socket_timeout_seconds == 2.0


def test_tg362_redis_db_defaults_to_the_development_index() -> None:
    settings = RedisSettings(redis_host="cache", redis_port=6379, _env_file=None)

    assert settings.redis_db == 0


def test_tg362_redis_url_selects_the_configured_index() -> None:
    settings = RedisSettings(
        redis_host="cache", redis_port=6379, redis_db=14, _env_file=None
    )

    assert settings.redis_url == "redis://cache:6379/14"


def test_tg362_redis_db_is_configurable_by_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_HOST", "localhost")
    monkeypatch.setenv("REDIS_PORT", "6379")
    monkeypatch.setenv("REDIS_DB", "15")

    settings = RedisSettings(_env_file=None)

    assert settings.redis_db == 15
    assert settings.redis_url == "redis://localhost:6379/15"


@pytest.mark.parametrize("redis_db", [-1, 16])
def test_tg362_redis_db_out_of_range_is_rejected(redis_db: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        RedisSettings(
            redis_host="cache", redis_port=6379, redis_db=redis_db, _env_file=None
        )

    assert {str(error["loc"][0]) for error in exc_info.value.errors()} == {"redis_db"}
