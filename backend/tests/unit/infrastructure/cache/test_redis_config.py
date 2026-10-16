import pytest
from pydantic import ValidationError

from app.infrastructure.cache.config import RedisSettings


def test_redis_url_is_built_from_host_and_port() -> None:
    settings = RedisSettings(redis_host="cache", redis_port=6379, _env_file=None)

    assert settings.redis_url == "redis://cache:6379"


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

    assert settings.redis_url == "redis://localhost:6380"
    assert settings.cache_default_ttl_seconds == 120


def test_missing_host_and_port_are_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_HOST", raising=False)
    monkeypatch.delenv("REDIS_PORT", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        RedisSettings(_env_file=None)

    missing = {str(error["loc"][0]) for error in exc_info.value.errors()}
    assert missing == {"redis_host", "redis_port"}
