"""GET /api/users/me. TG-139."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.domain.users.models import AccountStatus, User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.users.dependencies import get_user_service
from app.infrastructure.users.router import router
from app.main import create_app
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.users import InMemoryUserRepository

PROBLEM_JSON = "application/problem+json"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)


def _user(**overrides: object) -> User:
    user = User.create(
        google_sub="google-123",
        email="ana@example.com",
        display_name="Ana",
        avatar_url="https://example.com/ana.png",
    )
    return user.model_copy(update=overrides)


async def _client(*users: User) -> AsyncIterator[tuple[AsyncClient, str]]:
    auth = AuthService(
        FakeGoogleTokenVerifier(IDENTITY),
        FakeTokenCodec(),
        InMemorySessionStore(),
        FakeAccountGateway(),
        DURATIONS,
    )
    app = FastAPI()
    app.include_router(router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_user_service] = lambda: UserService(
        InMemoryUserRepository(*users)
    )
    tokens = await auth.login("google-id-token")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, tokens.access_token


def _assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def test_me_returns_the_profile_of_the_authenticated_user() -> None:
    # TG-139 / US #45 criteri 7
    user = _user()
    async for client, token in _client(user):
        response = await client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "email": "ana@example.com",
        "display_name": "Ana",
        "avatar_url": "https://example.com/ana.png",
        "preferred_language": "ca",
        "role": "user",
    }


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_me_without_a_valid_session_is_401(headers: dict[str, str]) -> None:
    # TG-139 / US #45 criteri 7
    async for client, _ in _client(_user()):
        response = await client.get("/api/users/me", headers=headers)

    _assert_problem(response, 401, INVALID_SESSION)


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"status": AccountStatus.SUSPENDED}, ACCOUNT_SUSPENDED),
        ({"status": AccountStatus.BANNED}, ACCOUNT_SUSPENDED),
        ({"deleted_at": datetime(2026, 10, 1, tzinfo=UTC)}, ACCOUNT_DELETED),
    ],
)
async def test_me_of_a_suspended_banned_or_deleted_account_is_403(
    overrides: dict[str, object], code: str
) -> None:
    # TG-139 / US #45 criteri 6
    async for client, token in _client(_user(**overrides)):
        response = await client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {token}"}
        )

    _assert_problem(response, 403, code)


def test_swagger_documents_me_and_logout_with_problem_json_errors() -> None:
    paths = create_app().openapi()["paths"]

    me = paths["/api/users/me"]["get"]["responses"]
    assert set(me["200"]["content"]) == {"application/json"}
    for status in ("401", "403", "503"):
        assert set(me[status]["content"]) == {PROBLEM_JSON}
    logout = paths["/api/auth/logout"]["post"]["responses"]
    assert "204" in logout
    assert set(logout["503"]["content"]) == {PROBLEM_JSON}
