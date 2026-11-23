"""``require_role``: the server-side rule behind the admin panel. TG-77 criteri 5."""

from collections.abc import AsyncIterator
from typing import Annotated

import pytest
from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import ACCOUNT_SUSPENDED, INVALID_SESSION
from app.application.shared.error_codes import INSUFFICIENT_ROLE
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.domain.users.models import AccountStatus, Role, User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service, require_role
from app.infrastructure.users.dependencies import get_user_service
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

router = APIRouter()


@router.get("/admin-only")
async def admin_only(
    user: Annotated[User, Depends(require_role(Role.ADMIN))],
) -> dict[str, str]:
    return {"email": user.email}


@router.get("/staff-only")
async def staff_only(
    user: Annotated[User, Depends(require_role(Role.ADMIN, Role.MODERATOR))],
) -> dict[str, str]:
    return {"role": user.role}


def _user(**overrides: object) -> User:
    user = User.create(google_sub="google-123", email="ana@example.com")
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
    app.include_router(router)
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


async def test_without_a_session_it_is_a_401() -> None:
    # TG-77 criteri 5: sense sessió, 401
    async for client, _ in _client(_user(role=Role.ADMIN)):
        response = await client.get("/admin-only")

    _assert_problem(response, 401, INVALID_SESSION)


async def test_a_forged_token_is_a_401() -> None:
    # TG-77 criteri 5
    async for client, _ in _client(_user(role=Role.ADMIN)):
        response = await client.get(
            "/admin-only", headers={"Authorization": "Bearer forged"}
        )

    _assert_problem(response, 401, INVALID_SESSION)


@pytest.mark.parametrize("role", [Role.USER, Role.MODERATOR])
async def test_another_role_is_a_403_with_a_stable_code(role: Role) -> None:
    # TG-77 criteri 5: amb un altre rol, 403 amb `code` estable (ADR-0018)
    async for client, token in _client(_user(role=role)):
        response = await client.get(
            "/admin-only", headers={"Authorization": f"Bearer {token}"}
        )

    _assert_problem(response, 403, INSUFFICIENT_ROLE)


async def test_the_required_role_gets_through_and_receives_the_user() -> None:
    # TG-77 criteri 5
    async for client, token in _client(_user(role=Role.ADMIN)):
        response = await client.get(
            "/admin-only", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json() == {"email": "ana@example.com"}


@pytest.mark.parametrize("role", [Role.ADMIN, Role.MODERATOR])
async def test_any_of_several_allowed_roles_gets_through(role: Role) -> None:
    # TG-77 criteri 5: «un o més rols»
    async for client, token in _client(_user(role=role)):
        response = await client.get(
            "/staff-only", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json() == {"role": role.value}


async def test_a_plain_user_is_a_403_on_a_route_open_to_several_roles() -> None:
    # TG-77 criteri 5
    async for client, token in _client(_user(role=Role.USER)):
        response = await client.get(
            "/staff-only", headers={"Authorization": f"Bearer {token}"}
        )

    _assert_problem(response, 403, INSUFFICIENT_ROLE)


async def test_a_suspended_admin_is_a_403_and_the_role_is_not_enough() -> None:
    # TG-77 criteri 5: el compte suspès es rebutja abans de mirar el rol
    suspended = _user(role=Role.ADMIN, status=AccountStatus.SUSPENDED)
    async for client, token in _client(suspended):
        response = await client.get(
            "/admin-only", headers={"Authorization": f"Bearer {token}"}
        )

    _assert_problem(response, 403, ACCOUNT_SUSPENDED)
