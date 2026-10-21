"""POST /api/auth/google, POST /api/auth/refresh and CurrentSessionDep. TG-44."""

from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    IDENTITY_PROVIDER_UNAVAILABLE,
    INVALID_GOOGLE_TOKEN,
    INVALID_SESSION,
)
from app.application.shared.errors import ExternalServiceError, UnauthorizedError
from app.domain.auth.models import AccountStatus, GoogleIdentity, TokenType
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import (
    CurrentSessionDep,
    get_auth_service,
)
from app.infrastructure.auth.router import router
from app.main import create_app
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)

PROBLEM_JSON = "application/problem+json"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)


def make_service(
    status: AccountStatus = AccountStatus.ACTIVE,
    failure: Exception | None = None,
) -> tuple[AuthService, FakeTokenCodec, InMemorySessionStore]:
    codec = FakeTokenCodec()
    store = InMemorySessionStore()
    service = AuthService(
        FakeGoogleTokenVerifier(IDENTITY, failure),
        codec,
        store,
        FakeAccountGateway(status),
        DURATIONS,
    )
    return service, codec, store


def build_app(service: AuthService) -> FastAPI:
    # Router and handlers only, not create_app(): the real wiring needs Redis.
    app = FastAPI()
    app.include_router(router, prefix="/api")
    register_error_handlers(app)

    @app.get("/private")
    async def private(session: CurrentSessionDep) -> dict[str, str]:
        return {"sub": session.sub}

    app.dependency_overrides[get_auth_service] = lambda: service
    return app


async def client_for(service: AuthService) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=build_app(service)), base_url="http://test"
    ) as http:
        yield http


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def login(client: AsyncClient) -> dict[str, str]:
    response = await client.post("/api/auth/google", json={"id_token": "google"})
    assert response.status_code == 200
    tokens: dict[str, str] = response.json()
    return tokens


async def test_login_returns_the_session() -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        response = await client.post("/api/auth/google", json={"id_token": "g"})

    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"access_token", "refresh_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900


@pytest.mark.parametrize(
    ("status", "failure", "http_status", "code"),
    [
        (
            AccountStatus.ACTIVE,
            UnauthorizedError(INVALID_GOOGLE_TOKEN),
            401,
            INVALID_GOOGLE_TOKEN,
        ),
        (AccountStatus.SUSPENDED, None, 403, "ACCOUNT_SUSPENDED"),
        (AccountStatus.BANNED, None, 403, "ACCOUNT_SUSPENDED"),
        (AccountStatus.DELETED, None, 403, "ACCOUNT_DELETED"),
        (
            AccountStatus.ACTIVE,
            ExternalServiceError(IDENTITY_PROVIDER_UNAVAILABLE),
            503,
            IDENTITY_PROVIDER_UNAVAILABLE,
        ),
    ],
)
async def test_login_errors_have_the_status_and_code_of_the_us(
    status: AccountStatus,
    failure: Exception | None,
    http_status: int,
    code: str,
) -> None:
    service, _, _ = make_service(status, failure)
    async for client in client_for(service):
        response = await client.post("/api/auth/google", json={"id_token": "g"})

    assert_problem(response, http_status, code)


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/auth/google", {}),
        ("/api/auth/google", {"id_token": ""}),
        ("/api/auth/refresh", {}),
        ("/api/auth/refresh", {"refresh_token": ""}),
    ],
)
async def test_an_incomplete_body_is_a_validation_error(
    path: str, body: dict[str, str]
) -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        response = await client.post(path, json=body)

    assert_problem(response, 422, "VALIDATION_ERROR")


async def test_refresh_returns_a_new_pair_and_cannot_be_reused() -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        first = await login(client)

        renewed = await client.post(
            "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
        )
        reused = await client.post(
            "/api/auth/refresh", json={"refresh_token": first["refresh_token"]}
        )

    assert renewed.status_code == 200
    assert renewed.json()["refresh_token"] != first["refresh_token"]
    assert renewed.json()["token_type"] == "bearer"
    assert_problem(reused, 401, INVALID_SESSION)


async def test_refresh_with_an_unknown_token_is_an_invalid_session() -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        response = await client.post(
            "/api/auth/refresh", json={"refresh_token": "forged"}
        )

    assert_problem(response, 401, INVALID_SESSION)


async def test_a_private_endpoint_accepts_a_valid_access_token() -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        tokens = await login(client)
        response = await client.get(
            "/private", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )

    assert response.status_code == 200
    assert response.json() == {"sub": "google-123"}


async def test_a_private_endpoint_rejects_a_revoked_access_token() -> None:
    service, codec, store = make_service()
    async for client in client_for(service):
        tokens = await login(client)
        store.expire(TokenType.ACCESS, codec.decode(tokens["access_token"]).jti)
        response = await client.get(
            "/private", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )

    assert_problem(response, 401, INVALID_SESSION)


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Basic abc"}, id="not-bearer"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_a_private_endpoint_rejects_missing_or_invalid_tokens(
    headers: dict[str, str],
) -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        response = await client.get("/private", headers=headers)

    assert_problem(response, 401, INVALID_SESSION)


async def test_a_private_endpoint_rejects_a_refresh_token() -> None:
    service, _, _ = make_service()
    async for client in client_for(service):
        tokens = await login(client)
        response = await client.get(
            "/private",
            headers={"Authorization": f"Bearer {tokens['refresh_token']}"},
        )

    assert_problem(response, 401, INVALID_SESSION)


def test_swagger_documents_both_endpoints_with_problem_json_errors() -> None:
    paths = create_app().openapi()["paths"]

    for path in ("/api/auth/google", "/api/auth/refresh"):
        operation = paths[path]["post"]
        assert set(operation["responses"]["200"]["content"]) == {"application/json"}
        assert set(operation["responses"]["401"]["content"]) == {PROBLEM_JSON}


async def test_logout_closes_the_whole_session_and_answers_204() -> None:
    # TG-139 / US #45 criteri 8
    service, _, _ = make_service()
    async for client in client_for(service):
        tokens = await login(client)
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        response = await client.post("/api/auth/logout", headers=headers)
        after_access = await client.get("/private", headers=headers)
        after_refresh = await client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )

    assert response.status_code == 204
    assert response.content == b""
    assert_problem(after_access, 401, INVALID_SESSION)
    assert_problem(after_refresh, 401, INVALID_SESSION)


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_logout_without_a_usable_token_is_still_204(
    headers: dict[str, str],
) -> None:
    # TG-139 / US #45 criteri 10
    service, _, _ = make_service()
    async for client in client_for(service):
        response = await client.post("/api/auth/logout", headers=headers)

    assert response.status_code == 204


async def test_logout_twice_is_still_204() -> None:
    # TG-139 / US #45 criteri 10
    service, _, _ = make_service()
    async for client in client_for(service):
        tokens = await login(client)
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        first = await client.post("/api/auth/logout", headers=headers)
        second = await client.post("/api/auth/logout", headers=headers)

    assert (first.status_code, second.status_code) == (204, 204)
