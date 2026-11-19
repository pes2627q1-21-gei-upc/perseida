import asyncio
import os
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from app.application.shared.errors import ExternalServiceError
from app.domain.chat.ports import RepublishGuard
from app.infrastructure.chat.republish_guard import RedisRepublishGuard

pytestmark = pytest.mark.skipif(not os.getenv("REDIS_HOST"), reason="Redis required")


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis(
        host=os.environ["REDIS_HOST"], port=int(os.getenv("REDIS_PORT", "6379"))
    )
    yield client
    await client.aclose()


def _key(author: object, message: object) -> str:
    return f"chat:republished:{author}:{message}"


async def test_tg654_an_unmarked_message_was_not_published_recently(
    redis: Redis,
) -> None:
    guard: RepublishGuard = RedisRepublishGuard(redis)

    assert not await guard.was_published_recently(uuid4(), uuid4())


async def test_tg654_a_marked_message_was_published_recently_with_the_default_cooldown(
    redis: Redis,
) -> None:
    guard = RedisRepublishGuard(redis)
    author, message = uuid4(), uuid4()
    try:
        await guard.mark_published(author, message)

        assert await guard.was_published_recently(author, message)
        assert 0 < await redis.ttl(_key(author, message)) <= 10
    finally:
        await redis.delete(_key(author, message))


async def test_tg654_the_mark_expires_with_the_cooldown(redis: Redis) -> None:
    guard = RedisRepublishGuard(redis, cooldown_seconds=1)
    author, message = uuid4(), uuid4()
    try:
        await guard.mark_published(author, message)
        assert await guard.was_published_recently(author, message)
        assert 0 < await redis.ttl(_key(author, message)) <= 1

        await asyncio.sleep(1.2)

        assert not await guard.was_published_recently(author, message)
    finally:
        await redis.delete(_key(author, message))


async def test_tg654_marks_of_other_authors_or_messages_are_independent(
    redis: Redis,
) -> None:
    guard = RedisRepublishGuard(redis)
    author, other_author, message, other_message = uuid4(), uuid4(), uuid4(), uuid4()
    try:
        await guard.mark_published(author, message)

        assert not await guard.was_published_recently(other_author, message)
        assert not await guard.was_published_recently(author, other_message)
    finally:
        await redis.delete(_key(author, message))


async def test_tg654_the_cooldown_must_be_positive() -> None:
    client = Redis(host="127.0.0.1", port=1)
    try:
        with pytest.raises(ValueError):
            RedisRepublishGuard(client, cooldown_seconds=0)
    finally:
        await client.aclose()


async def test_tg654_redis_unavailable_is_translated_in_both_calls() -> None:
    client = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.1)
    guard = RedisRepublishGuard(client)
    try:
        with pytest.raises(ExternalServiceError):
            await guard.was_published_recently(uuid4(), uuid4())
        with pytest.raises(ExternalServiceError):
            await guard.mark_published(uuid4(), uuid4())
    finally:
        await client.aclose()
