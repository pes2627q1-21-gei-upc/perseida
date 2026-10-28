"""Auth API end to end: real Google verification (respx + RSA key) and real JWTs.

Only the edges are simulated: Google's keys (respx), the session store (in memory)
and the account gateway. Redis itself is covered by test_redis_session_store.py.
"""

from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    IDENTITY_PROVIDER_UNAVAILABLE,
    INVALID_GOOGLE_TOKEN,
    INVALID_SESSION,
)
from app.domain.auth.models import AccountStatus
from app.infrastructure.auth.dependencies import CurrentSessionDep, get_auth_service
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token
from tests.fakes.auth import FakeAccountGateway, InMemorySessionStore

SECRET = "i" * 40
PROBLEM_JSON = "application/problem+json"


@pytest.fixture
def google_certs() -> Iterator[respx.Route]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})


def make_app(
    google: httpx.AsyncClient, status: AccountStatus = AccountStatus.ACTIVE
) -> FastAPI:
    service = AuthService(
        GoogleJwksVerifier(google, [CLIENT_ID]),
        JwtTokenCodec(SECRET),
        InMemorySessionStore(),
        FakeAccountGateway(status),
        SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
    )
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: service

    @app.get("/api/private")
    async def private(session: CurrentSessionDep) -> dict[str, str]:
        return {"sub": session.sub}

    return app


async def open_client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


@pytest.fixture
async def client(google_certs: respx.Route) -> AsyncIterator[AsyncClient]:
    async with httpx.AsyncClient() as google:
        async for http in open_client(make_app(google)):
            yield http


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def login(client: AsyncClient) -> dict[str, Any]:
    response = await client.post("/api/auth/google", json={"id_token": token()})
    assert response.status_code == 200
    tokens: dict[str, Any] = response.json()
    return tokens


async def test_a_valid_google_token_returns_two_signed_tokens(
    client: AsyncClient,
) -> None:
    tokens = await login(client)

    access = jwt.decode(tokens["access_token"], SECRET, algorithms=["HS256"])
    refresh = jwt.decode(tokens["refresh_token"], SECRET, algorithms=["HS256"])
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] == 900
    assert (access["type"], refresh["type"]) == ("access", "refresh")
    assert access["sub"] == refresh["sub"] == "google-123"
    assert access["exp"] - access["iat"] == 900
    assert refresh["exp"] - refresh["iat"] == 2_592_000


@pytest.mark.parametrize(
    "bad_token",
    [
        pytest.param(token(key=rsa.generate_private_key(65537, 2048)), id="forged"),
        pytest.param(token(exp=datetime.now(UTC) - timedelta(hours=1)), id="expired"),
        pytest.param(token(aud="another-app"), id="other-audience"),
        pytest.param(token(email_verified=False), id="email-not-verified"),
        pytest.param("not-a-jwt", id="garbage"),
    ],
)
async def test_an_invalid_google_token_is_a_401(
    client: AsyncClient, bad_token: str
) -> None:
    response = await client.post("/api/auth/google", json={"id_token": bad_token})

    assert_problem(response, 401, INVALID_GOOGLE_TOKEN)


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (AccountStatus.SUSPENDED, ACCOUNT_SUSPENDED),
        (AccountStatus.BANNED, ACCOUNT_SUSPENDED),
        (AccountStatus.DELETED, ACCOUNT_DELETED),
    ],
)
async def test_an_account_that_cannot_log_in_is_a_403(
    google_certs: respx.Route, status: AccountStatus, code: str
) -> None:
    async with httpx.AsyncClient() as google:
        async for client in open_client(make_app(google, status)):
            response = await client.post("/api/auth/google", json={"id_token": token()})

    assert_problem(response, 403, code)


async def test_google_down_without_keys_is_a_503() -> None:
    with respx.mock(assert_all_called=False) as mock:
        mock.get(GOOGLE_CERTS_URL).respond(500)
        async with httpx.AsyncClient() as google:
            async for client in open_client(make_app(google)):
                response = await client.post(
                    "/api/auth/google", json={"id_token": token()}
                )

    assert_problem(response, 503, IDENTITY_PROVIDER_UNAVAILABLE)


async def test_a_private_endpoint_without_a_header_is_a_401(
    client: AsyncClient,
) -> None:
    assert_problem(await client.get("/api/private"), 401, INVALID_SESSION)


async def test_a_private_endpoint_accepts_a_valid_access_token(
    client: AsyncClient,
) -> None:
    tokens = await login(client)

    response = await client.get(
        "/api/private", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )

    assert response.status_code == 200
    assert response.json() == {"sub": "google-123"}


async def test_a_private_endpoint_rejects_the_refresh_token(
    client: AsyncClient,
) -> None:
    tokens = await login(client)

    response = await client.get(
        "/api/private", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )

    assert_problem(response, 401, INVALID_SESSION)


async def test_refresh_works_once_and_the_same_refresh_cannot_be_reused(
    client: AsyncClient,
) -> None:
    tokens = await login(client)
    body = {"refresh_token": tokens["refresh_token"]}

    first = await client.post("/api/auth/refresh", json=body)
    second = await client.post("/api/auth/refresh", json=body)

    assert first.status_code == 200
    assert first.json()["refresh_token"] != tokens["refresh_token"]
    assert_problem(second, 401, INVALID_SESSION)
