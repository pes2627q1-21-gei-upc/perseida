"""``require_role`` with PostgreSQL and Redis for real (TG-77 criteri 5 i 10).

Only Google is simulated (respx + a throwaway RSA key). The role is read from the
``users`` table on every request, so a change of role is seen at once.
"""

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Annotated, Any

import httpx
import pytest
import respx
from alembic.config import Config
from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient, Response
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import ACCOUNT_SUSPENDED, INVALID_SESSION
from app.application.shared.error_codes import INSUFFICIENT_ROLE
from app.domain.users.models import Role, User
from app.infrastructure.auth.dependencies import require_role
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

PROBLEM_JSON = "application/problem+json"

# A route that exists only in this test: no real admin endpoint exists yet (TG-73).
probe = APIRouter()


@probe.get("/api/_probe/admin")
async def admin_probe(
    user: Annotated[User, Depends(require_role(Role.ADMIN))],
) -> dict[str, str]:
    return {"email": user.email}


@probe.get("/api/_probe/staff")
async def staff_probe(
    user: Annotated[User, Depends(require_role(Role.ADMIN, Role.MODERATOR))],
) -> dict[str, str]:
    return {"role": user.role}


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    # The tests must leave the configured database as they found it.
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
def google_certs() -> Iterator[respx.Route]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})


@pytest.fixture
async def connection() -> AsyncIterator[AsyncConnection]:
    """One connection inside a transaction that is rolled back after the test."""
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                yield connection
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
def factory(connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    # Each commit of the app becomes a savepoint of the test's transaction.
    return async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )


@pytest.fixture
async def client(
    google_certs: respx.Route,
    factory: async_sessionmaker[AsyncSession],
    redis: Redis,
) -> AsyncIterator[AsyncClient]:
    users = build_user_service(factory)
    async with httpx.AsyncClient() as google:
        app: FastAPI = create_app()
        app.include_router(probe)
        app.state.user_service = users
        app.state.auth_service = AuthService(
            GoogleJwksVerifier(google, [CLIENT_ID]),
            JwtTokenCodec("i" * 40),
            RedisSessionStore(redis, RedisPubSub(redis)),
            UserAccountGateway(users),
            SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http


async def login(client: AsyncClient) -> tuple[dict[str, str], str]:
    """Create an account through the real login; return its headers and email."""
    sub = f"it-{uuid.uuid4().hex}"
    email = f"{sub}@example.test"
    response = await client.post(
        "/api/auth/google",
        json={"id_token": token(sub=sub, email=email, name="Ana")},
    )
    tokens: dict[str, Any] = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}, email


async def set_column(
    connection: AsyncConnection, email: str, column: str, value: str
) -> None:
    # ``column`` is one of two literals below, never user input (ADR-0024).
    assert column in {"role", "status"}
    await connection.execute(
        text(f"UPDATE users SET {column} = :value WHERE email = :email"),  # noqa: S608
        {"value": value, "email": email},
    )


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def test_without_a_session_it_is_a_401(client: AsyncClient) -> None:
    # TG-77 criteri 5
    response = await client.get("/api/_probe/admin")

    assert_problem(response, 401, INVALID_SESSION)


async def test_a_plain_user_is_a_403(client: AsyncClient) -> None:
    # TG-77 criteri 5: el rol per defecte (TG-45) és `user`
    headers, _ = await login(client)

    response = await client.get("/api/_probe/admin", headers=headers)

    assert_problem(response, 403, INSUFFICIENT_ROLE)


async def test_an_admin_gets_through(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-77 criteri 5
    headers, email = await login(client)
    await set_column(connection, email, "role", "admin")

    response = await client.get("/api/_probe/admin", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"email": email}


@pytest.mark.parametrize("role", ["admin", "moderator"])
async def test_a_route_open_to_several_roles_lets_each_of_them_in(
    client: AsyncClient, connection: AsyncConnection, role: str
) -> None:
    # TG-77 criteri 5 i 3: admin i moderator entren
    headers, email = await login(client)
    await set_column(connection, email, "role", role)

    response = await client.get("/api/_probe/staff", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"role": role}


async def test_a_moderator_is_a_403_on_an_admin_only_route(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-77 criteri 5 i notes: els endpoints d'administració exigeixen `admin`
    headers, email = await login(client)
    await set_column(connection, email, "role", "moderator")

    response = await client.get("/api/_probe/admin", headers=headers)

    assert_problem(response, 403, INSUFFICIENT_ROLE)


async def test_a_change_of_role_is_seen_with_the_same_session(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # The role is read from the database, not stored in the token.
    headers, email = await login(client)
    await set_column(connection, email, "role", "admin")
    assert (await client.get("/api/_probe/admin", headers=headers)).status_code == 200

    await set_column(connection, email, "role", "user")

    response = await client.get("/api/_probe/admin", headers=headers)
    assert_problem(response, 403, INSUFFICIENT_ROLE)


async def test_a_suspended_admin_is_a_403(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-77 criteri 5: el compte suspès no entra, tingui el rol que tingui
    headers, email = await login(client)
    await set_column(connection, email, "role", "admin")
    await set_column(connection, email, "status", "suspended")

    response = await client.get("/api/_probe/admin", headers=headers)

    assert_problem(response, 403, ACCOUNT_SUSPENDED)
