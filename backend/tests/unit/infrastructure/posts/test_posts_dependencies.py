"""Wiring of the post service: write rate limit over Redis (TG-645)."""

import uuid
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from starlette.requests import HTTPConnection

from app.application.posts.post_service import PostService
from app.application.shared.errors import RateLimitedError
from app.infrastructure.posts.config import PostsSettings
from app.infrastructure.posts.dependencies import get_post_service, get_posts_settings


class RecordingRedis:
    """Answers every counter increment with ``count`` and records the calls."""

    def __init__(self, count: int) -> None:
        self.count = count
        self.calls: list[tuple[Any, ...]] = []

    async def eval(self, *args: Any) -> int:
        self.calls.append(args)
        return self.count


def _conn(redis: RecordingRedis) -> HTTPConnection:
    state = SimpleNamespace(session_factory=MagicMock(), redis=redis)
    return cast(HTTPConnection, SimpleNamespace(app=SimpleNamespace(state=state)))


def test_tg645_posts_settings_are_read_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POSTS_WRITE_RATE_LIMIT", "4")
    get_posts_settings.cache_clear()
    try:
        settings = get_posts_settings()
        assert settings.posts_write_rate_limit == 4
        assert get_posts_settings() is settings
    finally:
        get_posts_settings.cache_clear()


async def test_tg645_service_limits_writes_with_the_posts_counter() -> None:
    # TG-645: limitador Redis amb prefix "posts" i els valors de PostsSettings
    settings = PostsSettings(
        _env_file=None,
        posts_write_rate_limit=3,
        posts_write_rate_limit_window_seconds=30,
    )
    redis = RecordingRedis(count=4)  # one over the configured limit
    service = get_post_service(_conn(redis), settings)
    user_id = uuid.uuid7()

    assert isinstance(service, PostService)
    with pytest.raises(RateLimitedError):
        await service.delete_post(post_id=uuid.uuid7(), author_id=user_id)

    [(_script, keys, key, window)] = redis.calls
    assert (keys, key, window) == (1, f"ratelimit:posts:{user_id}", 30)
