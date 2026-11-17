"""POST /api/streaks/me/activity and GET /api/streaks/me. TG-540 (US TG-56)."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
from app.application.streaks.streak_service import StreakService
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.domain.streaks.models import DailyStreak
from app.domain.users.models import User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.streaks.dependencies import get_streak_service
from app.infrastructure.streaks.router import router
from app.infrastructure.users.dependencies import get_user_service
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.streaks import FakeStreakRepository
from tests.fakes.users import InMemoryUserRepository

PROBLEM_JSON = "application/problem+json"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
TODAY = date(2026, 11, 11)
NOW = datetime(2026, 11, 11, 10, 0, tzinfo=UTC)

ME = User.create(google_sub="google-123", email="ana@example.com", display_name="Ana")
OTHER = User.create(
    google_sub="google-999", email="bob@example.com", display_name="Bob"
)
ME_STREAK_ID = uuid.uuid7()
OTHER_STREAK_ID = uuid.uuid7()


async def _client(
    repo: FakeStreakRepository,
) -> AsyncIterator[tuple[AsyncClient, str]]:
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
        InMemoryUserRepository(ME, OTHER)
    )
    app.dependency_overrides[get_streak_service] = lambda: StreakService(
        repo, now=lambda: NOW
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


@pytest.mark.parametrize(
    ("method", "path"),
    [("POST", "/api/streaks/me/activity"), ("GET", "/api/streaks/me")],
)
@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_streak_endpoints_without_a_valid_session_are_401(
    method: str, path: str, headers: dict[str, str]
) -> None:
    # TG-540 / US TG-56: endpoints privats
    repo = FakeStreakRepository()
    async for client, _ in _client(repo):
        response = await client.request(method, path, headers=headers)

    _assert_problem(response, 401, INVALID_SESSION)
    assert repo.saved == []


async def test_post_activity_registers_today_and_returns_the_count() -> None:
    # TG-540 / US TG-56: registrar activitat
    repo = FakeStreakRepository()
    async for client, token in _client(repo):
        response = await client.post(
            "/api/streaks/me/activity", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json() == {"current_count": 1}
    assert [s.user_id for s in repo.saved] == [ME.id]
    assert repo.saved[0].last_activity_date == TODAY


async def test_post_activity_twice_the_same_day_is_idempotent() -> None:
    # TG-540 / US TG-56: idempotent el mateix dia
    repo = FakeStreakRepository()
    async for client, token in _client(repo):
        headers = {"Authorization": f"Bearer {token}"}
        await client.post("/api/streaks/me/activity", headers=headers)
        response = await client.post("/api/streaks/me/activity", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"current_count": 1}


async def test_get_streak_returns_the_current_count_of_the_session_user() -> None:
    # TG-540 / US TG-56: consultar la ratxa; usa l'usuari de la sessio
    repo = FakeStreakRepository(
        DailyStreak(
            id=ME_STREAK_ID, user_id=ME.id, current_count=4, last_activity_date=TODAY
        ),
        DailyStreak(
            id=OTHER_STREAK_ID,
            user_id=OTHER.id,
            current_count=9,
            last_activity_date=TODAY,
        ),
    )
    async for client, token in _client(repo):
        response = await client.get(
            "/api/streaks/me", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.status_code == 200
    assert response.json() == {"current_count": 4}
    assert repo.saved == []


async def test_get_streak_is_zero_without_a_streak_or_when_it_lapsed() -> None:
    # TG-540 / US TG-56: 0 si no hi ha ratxa o s'ha trencat
    lapsed = FakeStreakRepository(
        DailyStreak(
            id=ME_STREAK_ID,
            user_id=ME.id,
            current_count=5,
            last_activity_date=date(2026, 11, 1),
        )
    )
    async for client, token in _client(FakeStreakRepository()):
        empty = await client.get(
            "/api/streaks/me", headers={"Authorization": f"Bearer {token}"}
        )
    async for client, token in _client(lapsed):
        broken = await client.get(
            "/api/streaks/me", headers={"Authorization": f"Bearer {token}"}
        )

    assert empty.json() == {"current_count": 0}
    assert broken.json() == {"current_count": 0}


async def test_post_activity_only_touches_the_session_users_streak() -> None:
    # TG-540 / US TG-56: no s'escriu la ratxa d'un altre usuari
    other = DailyStreak(
        id=OTHER_STREAK_ID, user_id=OTHER.id, current_count=9, last_activity_date=TODAY
    )
    repo = FakeStreakRepository(other)
    async for client, token in _client(repo):
        response = await client.post(
            "/api/streaks/me/activity", headers={"Authorization": f"Bearer {token}"}
        )

    assert response.json() == {"current_count": 1}
    assert repo.streaks[OTHER.id] == other
    assert repo.streaks[ME.id].current_count == 1
