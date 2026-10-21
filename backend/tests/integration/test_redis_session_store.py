import asyncio
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.shared.errors import UnauthorizedError
from app.domain.auth.models import GoogleIdentity, SessionClaims, TokenType
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from tests.fakes.auth import FakeAccountGateway, FakeGoogleTokenVerifier

pytestmark = pytest.mark.skipif(
    not os.getenv("REDIS_HOST"),
    reason="Redis integration tests require REDIS_HOST",
)


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


@pytest.fixture
def sub() -> str:
    return f"test-{uuid4().hex}"


def claims(
    sub: str, kind: TokenType = TokenType.ACCESS, sid: str = "sid-1"
) -> SessionClaims:
    return SessionClaims(
        sub=sub,
        jti=f"test-{uuid4().hex}",
        sid=sid,
        type=kind,
        exp=datetime(2030, 1, 1, tzinfo=UTC),
    )


async def test_a_saved_token_exists_under_the_session_prefix(
    redis: Redis, sub: str
) -> None:
    store = RedisSessionStore(redis)
    token = claims(sub)

    await store.save(token, 900)

    assert await store.exists(TokenType.ACCESS, token.jti)
    assert not await store.exists(TokenType.REFRESH, token.jti)
    assert 0 < await redis.ttl(f"session:access:{token.jti}") <= 900
    await store.revoke_all(sub)


async def test_a_token_disappears_after_its_ttl(redis: Redis, sub: str) -> None:
    store = RedisSessionStore(redis)
    token = claims(sub)

    await store.save(token, 1)
    assert await store.exists(TokenType.ACCESS, token.jti)
    await asyncio.sleep(1.2)

    assert not await store.exists(TokenType.ACCESS, token.jti)
    await redis.delete(f"user_sessions:{sub}")


async def test_delete_revokes_once_and_reports_who_did_it(
    redis: Redis, sub: str
) -> None:
    store = RedisSessionStore(redis)
    token = claims(sub, TokenType.REFRESH)
    await store.save(token, 900)

    results = await asyncio.gather(store.delete(token), store.delete(token))

    assert sorted(results) == [False, True]
    assert not await store.exists(TokenType.REFRESH, token.jti)
    await store.revoke_all(sub)


async def test_the_user_index_lives_as_long_as_the_longest_token(
    redis: Redis, sub: str
) -> None:
    store = RedisSessionStore(redis)

    await store.save(claims(sub, TokenType.REFRESH), 2_592_000)
    await store.save(claims(sub), 900)

    assert 900 < await redis.ttl(f"user_sessions:{sub}") <= 2_592_000
    await store.revoke_all(sub)


async def test_revoke_session_only_removes_that_sessions_pair(
    redis: Redis, sub: str
) -> None:
    store = RedisSessionStore(redis)
    access, refresh = claims(sub), claims(sub, TokenType.REFRESH)
    other = claims(sub, sid="sid-2")
    for token in (access, refresh, other):
        await store.save(token, 900)

    await store.revoke_session(sub, "sid-1")

    assert not await store.exists(TokenType.ACCESS, access.jti)
    assert not await store.exists(TokenType.REFRESH, refresh.jti)
    assert await store.exists(TokenType.ACCESS, other.jti)
    await store.revoke_all(sub)


async def test_revoke_all_removes_every_session_of_the_user_and_no_other(
    redis: Redis, sub: str
) -> None:
    store = RedisSessionStore(redis)
    mine = [claims(sub, sid="sid-1"), claims(sub, TokenType.REFRESH, sid="sid-2")]
    theirs = claims(f"{sub}-other")
    for token in (*mine, theirs):
        await store.save(token, 900)

    await store.revoke_all(sub)

    for token in mine:
        assert not await store.exists(token.type, token.jti)
    assert await store.exists(TokenType.ACCESS, theirs.jti)
    assert await redis.scard(f"user_sessions:{sub}") == 0
    await store.revoke_all(theirs.sub)


async def test_logout_through_the_service_revokes_the_pair_in_redis(
    redis: Redis, sub: str
) -> None:
    # TG-138 / US #45 criteri 8: AuthService.logout sobre el Redis real
    identity = GoogleIdentity(google_sub=sub, email="ana@example.com")
    store = RedisSessionStore(redis)
    service = AuthService(
        FakeGoogleTokenVerifier(identity),
        JwtTokenCodec("x" * 32),
        store,
        FakeAccountGateway(),
        SessionDurations(access_seconds=900, refresh_seconds=3600),
    )
    tokens = await service.login("google-id-token")
    other = await service.login("google-id-token")

    await service.logout(tokens.access_token)
    await service.logout(tokens.access_token)

    with pytest.raises(UnauthorizedError):
        await service.authenticate(tokens.access_token)
    with pytest.raises(UnauthorizedError):
        await service.refresh(tokens.refresh_token)
    assert (await service.authenticate(other.access_token)).sub == sub
    await store.revoke_all(sub)
