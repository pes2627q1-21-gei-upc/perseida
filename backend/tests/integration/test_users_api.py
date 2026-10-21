"""Users and logout API with PostgreSQL and Redis for real (TG-140, US #45).

Only Google is simulated (respx + a throwaway RSA key); the app is wired as the
lifespan does it, with the real session store and user repository.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.application.users.errors import EMAIL_ALREADY_REGISTERED
from app.domain.auth.models import SessionClaims, TokenType
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

PROBLEM_JSON = "application/problem+json"


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
def google_certs() -> Iterator[respx.Route]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM user_identities"))
            await connection.execute(text("DELETE FROM users"))
        await engine.dispose()


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


@pytest.fixture
async def client(
    google_certs: respx.Route, engine: AsyncEngine, redis: Redis
) -> AsyncIterator[AsyncClient]:
    users = build_user_service(async_sessionmaker(engine, expire_on_commit=False))
    async with httpx.AsyncClient() as google:
        app: FastAPI = create_app()
        app.state.user_service = users
        app.state.auth_service = AuthService(
            GoogleJwksVerifier(google, CLIENT_ID),
            JwtTokenCodec("i" * 40),
            RedisSessionStore(redis),
            UserAccountGateway(users),
            SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http


@pytest.fixture
def sub() -> str:
    return f"it-{uuid.uuid4().hex}"


async def login(
    client: AsyncClient, sub: str, email: str | None = None, **body: Any
) -> Response:
    id_token = token(sub=sub, email=email or f"{sub}@example.test", name="Ana")
    return await client.post("/api/auth/google", json={"id_token": id_token, **body})


def bearer(tokens: dict[str, Any], kind: str = "access_token") -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens[kind]}"}


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def scalar(engine: AsyncEngine, sql: str, **params: Any) -> Any:
    async with engine.connect() as connection:
        return (await connection.execute(text(sql), params)).scalar_one()


async def test_first_login_creates_the_account_and_returns_the_session(
    client: AsyncClient, engine: AsyncEngine, sub: str
) -> None:
    # TG-140 / US #45 criteri 2
    response = await login(client, sub, language="es")

    assert response.status_code == 200
    async with engine.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT u.email, u.display_name, u.role, u.preferred_language "
                    "FROM users u JOIN user_identities i ON i.user_id = u.id "
                    "WHERE i.provider = 'google' AND i.subject = :sub"
                ),
                {"sub": sub},
            )
        ).one()
    assert tuple(row) == (f"{sub}@example.test", "Ana", "user", "es")


async def test_a_returning_login_updates_last_login_without_duplicates(
    client: AsyncClient, engine: AsyncEngine, sub: str
) -> None:
    # TG-140 / US #45 criteri 3
    await login(client, sub)
    before = await scalar(
        engine,
        "SELECT last_login_at FROM users WHERE email = :e",
        e=f"{sub}@example.test",
    )

    response = await login(client, sub)

    after = await scalar(
        engine,
        "SELECT last_login_at FROM users WHERE email = :e",
        e=f"{sub}@example.test",
    )
    assert response.status_code == 200
    assert after > before
    assert await scalar(engine, "SELECT count(*) FROM users") == 1
    assert await scalar(engine, "SELECT count(*) FROM user_identities") == 1


async def test_two_simultaneous_first_logins_leave_a_single_account(
    client: AsyncClient, engine: AsyncEngine, sub: str
) -> None:
    # TG-140 / US #45 criteri 4
    responses = await asyncio.gather(*(login(client, sub) for _ in range(4)))

    assert [r.status_code for r in responses] == [200] * 4
    assert await scalar(engine, "SELECT count(*) FROM users") == 1
    assert await scalar(engine, "SELECT count(*) FROM user_identities") == 1


async def test_an_email_of_another_google_account_is_a_409(
    client: AsyncClient, engine: AsyncEngine, sub: str
) -> None:
    # TG-140 / US #45 criteri 3: cap duplicat per email
    await login(client, sub, email="shared@example.test")

    response = await login(client, f"{sub}-other", email="shared@example.test")

    assert_problem(response, 409, EMAIL_ALREADY_REGISTERED)
    assert await scalar(engine, "SELECT count(*) FROM users") == 1


async def test_a_deleted_account_is_a_403_and_no_new_user_is_created(
    client: AsyncClient, engine: AsyncEngine, sub: str
) -> None:
    # TG-140 / US #45 criteri 5
    await login(client, sub)
    async with engine.begin() as connection:
        await connection.execute(text("UPDATE users SET deleted_at = now()"))

    response = await login(client, sub)

    assert_problem(response, 403, ACCOUNT_DELETED)
    assert await scalar(engine, "SELECT count(*) FROM users") == 1
    assert await scalar(engine, "SELECT count(*) FROM user_identities") == 1


@pytest.mark.parametrize("status", ["suspended", "banned"])
async def test_a_suspended_or_banned_account_is_a_403_on_login_and_on_me(
    client: AsyncClient, engine: AsyncEngine, sub: str, status: str
) -> None:
    # TG-140 / US #45 criteri 6
    tokens = (await login(client, sub)).json()
    async with engine.begin() as connection:
        await connection.execute(text("UPDATE users SET status = :s"), {"s": status})

    relogin = await login(client, sub)
    me = await client.get("/api/users/me", headers=bearer(tokens))

    assert_problem(relogin, 403, ACCOUNT_SUSPENDED)
    assert_problem(me, 403, ACCOUNT_SUSPENDED)


async def test_me_returns_the_profile_with_a_valid_session(
    client: AsyncClient, sub: str
) -> None:
    # TG-140 / US #45 criteri 7
    tokens = (await login(client, sub, language="en")).json()

    response = await client.get("/api/users/me", headers=bearer(tokens))

    body = response.json()
    assert response.status_code == 200
    assert uuid.UUID(body.pop("id")).version == 7
    assert body == {
        "email": f"{sub}@example.test",
        "display_name": "Ana",
        "avatar_url": "https://example.com/ana.png",
        "preferred_language": "en",
        "role": "user",
    }


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_me_without_a_valid_session_is_a_401(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    # TG-140 / US #45 criteri 7
    assert_problem(
        await client.get("/api/users/me", headers=headers), 401, INVALID_SESSION
    )


async def test_logout_revokes_the_access_and_the_refresh_token(
    client: AsyncClient, sub: str
) -> None:
    # TG-140 / US #45 criteri 8
    tokens = (await login(client, sub)).json()

    logout = await client.post("/api/auth/logout", headers=bearer(tokens))
    me = await client.get("/api/users/me", headers=bearer(tokens))
    refresh = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert logout.status_code == 204
    assert_problem(me, 401, INVALID_SESSION)
    assert_problem(refresh, 401, INVALID_SESSION)


async def test_logout_keeps_the_other_sessions_of_the_user(
    client: AsyncClient, sub: str
) -> None:
    closed = (await login(client, sub)).json()
    kept = (await login(client, sub)).json()

    await client.post("/api/auth/logout", headers=bearer(closed))

    assert (await client.get("/api/users/me", headers=bearer(kept))).status_code == 200


async def test_logout_is_idempotent(client: AsyncClient, sub: str) -> None:
    # TG-140 / US #45 criteri 10
    tokens = (await login(client, sub)).json()

    first = await client.post("/api/auth/logout", headers=bearer(tokens))
    second = await client.post("/api/auth/logout", headers=bearer(tokens))
    without_token = await client.post("/api/auth/logout")
    forged = await client.post(
        "/api/auth/logout", headers={"Authorization": "Bearer forged"}
    )

    assert [r.status_code for r in (first, second, without_token, forged)] == [204] * 4


async def test_logout_with_an_expired_access_token_still_revokes_the_refresh(
    client: AsyncClient, sub: str
) -> None:
    # TG-138 / US #45 criteri 10: l'access dura 15 min, el refresh 30 dies
    tokens = (await login(client, sub)).json()
    codec = JwtTokenCodec("i" * 40)
    live = codec.decode(tokens["refresh_token"])
    expired = codec.encode(
        SessionClaims(
            sub=live.sub,
            jti=uuid.uuid4().hex,
            sid=live.sid,
            type=TokenType.ACCESS,
            exp=datetime.now(UTC) - timedelta(hours=1),
        )
    )

    logout = await client.post(
        "/api/auth/logout", headers={"Authorization": f"Bearer {expired}"}
    )
    refresh = await client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert logout.status_code == 204
    assert_problem(refresh, 401, INVALID_SESSION)
