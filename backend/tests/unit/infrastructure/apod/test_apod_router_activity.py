"""GET /api/apod registers the day activity with a session. TG-598 (US TG-58).

Router only, with fakes. The session is optional: the endpoint stays public, and
a missing or invalid token behaves as no session (never 401).
"""

import logging
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.apod.apod_service import ApodService
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.application.streaks.streak_service import StreakService
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity, SessionClaims
from app.domain.streaks.models import DailyStreak
from app.domain.users.models import AccountStatus, User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.apod.dependencies import get_apod_service
from app.infrastructure.apod.router import router
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.streaks.dependencies import get_streak_service
from app.infrastructure.users.dependencies import get_user_service
from tests.factories.apod import make_apod
from tests.fakes.activity_log import FakeActivityLog
from tests.fakes.apod import FakeApodProvider
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.streaks import FakeStreakRepository
from tests.fakes.users import InMemoryUserRepository

IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
APOD_DAY = date(2026, 10, 14)
NOW = datetime(2026, 11, 11, 23, 59, tzinfo=UTC)
ME = User.create(google_sub="google-123", email="ana@example.com", display_name="Ana")


class Clock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class SpyStreakRepository(FakeStreakRepository):
    """Counts the calls and can fail, to tell "not called" from "called and failed"."""

    def __init__(self, failure: Exception | None = None) -> None:
        super().__init__()
        self.calls = 0
        self._failure = failure

    async def register_activity(
        self, user_id: uuid.UUID, today: Callable[[], date]
    ) -> DailyStreak:
        self.calls += 1
        if self._failure is not None:
            raise self._failure
        return await super().register_activity(user_id, today)


class UnavailableStoreAuth(AuthService):
    """Authenticates like AuthService until ``down`` is set, then the store is gone."""

    down = False

    async def authenticate(self, token: str) -> SessionClaims:
        if self.down:
            raise ExternalServiceError(SESSION_UNAVAILABLE)
        return await super().authenticate(token)


@dataclass
class Env:
    client: AsyncClient
    token: str
    repo: SpyStreakRepository
    provider: FakeApodProvider
    clock: Clock
    auth_headers: dict[str, str]
    codec: FakeTokenCodec
    auth: UnavailableStoreAuth


async def _build(
    failure: Exception | None = None, user: User = ME
) -> AsyncIterator[Env]:
    repo = SpyStreakRepository(failure)
    provider = FakeApodProvider([make_apod(APOD_DAY)], today=APOD_DAY)
    clock = Clock(NOW)
    codec = FakeTokenCodec()
    auth = UnavailableStoreAuth(
        FakeGoogleTokenVerifier(IDENTITY),
        codec,
        InMemorySessionStore(),
        FakeAccountGateway(),
        DURATIONS,
    )
    app = FastAPI()
    app.include_router(router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_user_service] = lambda: UserService(
        InMemoryUserRepository(user)
    )
    app.dependency_overrides[get_streak_service] = lambda: StreakService(
        repo, FakeActivityLog(), now=clock
    )
    app.dependency_overrides[get_apod_service] = lambda: ApodService(
        provider, today=lambda: APOD_DAY
    )
    tokens = await auth.login("google-id-token")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield Env(
            http,
            tokens.access_token,
            repo,
            provider,
            clock,
            {"Authorization": f"Bearer {tokens.access_token}"},
            codec,
            auth,
        )


@pytest.fixture
async def env() -> AsyncIterator[Env]:
    async for built in _build():
        yield built


@pytest.fixture
async def failing_env() -> AsyncIterator[Env]:
    async for built in _build(RuntimeError("database down")):
        yield built


async def test_tg598_c1_with_a_session_the_first_day_sets_the_streak_to_1(
    env: Env,
) -> None:
    response = await env.client.get("/api/apod", headers=env.auth_headers)

    assert response.status_code == 200
    assert [s.current_count for s in env.repo.saved] == [1]
    assert next(iter(env.repo.streaks.values())).user_id == ME.id


async def test_tg598_c1_the_same_utc_day_does_not_raise_the_streak_again(
    env: Env,
) -> None:
    await env.client.get("/api/apod", headers=env.auth_headers)
    await env.client.get("/api/apod", headers=env.auth_headers)

    (streak,) = env.repo.streaks.values()
    assert streak.current_count == 1


async def test_tg598_c1_the_next_utc_day_raises_the_streak_to_2(env: Env) -> None:
    await env.client.get("/api/apod", headers=env.auth_headers)
    env.clock.now = NOW + timedelta(minutes=2)  # crosses midnight UTC

    await env.client.get("/api/apod", headers=env.auth_headers)

    (streak,) = env.repo.streaks.values()
    assert streak.current_count == 2


async def test_tg598_c1_a_past_date_with_a_session_also_registers(env: Env) -> None:
    env.provider._by_date[date(2026, 10, 1)] = make_apod(date(2026, 10, 1))

    response = await env.client.get(
        "/api/apod", params={"date": "2026-10-01"}, headers=env.auth_headers
    )

    assert response.status_code == 200
    assert len(env.repo.streaks) == 1


async def test_tg598_c2_without_a_session_it_is_public_and_registers_nothing(
    env: Env,
) -> None:
    response = await env.client.get("/api/apod")

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"
    assert env.repo.calls == 0
    assert env.repo.streaks == {}


@pytest.mark.parametrize(
    "header",
    [
        pytest.param("Bearer forged-token", id="forged"),
        pytest.param("Bearer", id="no-credentials"),
        pytest.param("Basic abc", id="other-scheme"),
    ],
)
async def test_tg598_c3_an_invalid_token_is_treated_as_no_session(
    env: Env, header: str
) -> None:
    response = await env.client.get("/api/apod", headers={"Authorization": header})

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"
    assert env.repo.calls == 0
    assert env.repo.streaks == {}


async def test_tg598_c3_an_expired_token_is_treated_as_no_session() -> None:
    async for env in _build():
        env.codec.expire(env.token)

        response = await env.client.get("/api/apod", headers=env.auth_headers)

        assert response.status_code == 200
        assert env.repo.calls == 0
        assert env.repo.streaks == {}


async def test_tg598_c4_if_registering_fails_the_apod_is_still_returned(
    failing_env: Env,
) -> None:
    response = await failing_env.client.get(
        "/api/apod", headers=failing_env.auth_headers
    )

    assert failing_env.repo.calls == 1  # it was tried
    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"


async def test_tg598_c4_the_failure_is_only_logged(
    failing_env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level("WARNING"):
        await failing_env.client.get("/api/apod", headers=failing_env.auth_headers)

    assert failing_env.repo.calls == 1
    records = [
        r
        for r in caplog.records
        if r.name == "app.application.apod.apod_activity_service"
    ]
    assert [r.levelno for r in records] == [logging.WARNING]


async def test_tg598_c4_an_unavailable_session_store_is_still_a_200_and_a_warning(
    env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    env.auth.down = True

    with caplog.at_level("WARNING"):
        response = await env.client.get("/api/apod", headers=env.auth_headers)

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"
    assert env.repo.calls == 0
    assert env.repo.streaks == {}
    records = [
        r for r in caplog.records if r.name == "app.infrastructure.auth.dependencies"
    ]
    assert [r.levelno for r in records] == [logging.WARNING]


@pytest.mark.parametrize(
    "blocked",
    [
        pytest.param({"status": AccountStatus.SUSPENDED}, id="suspended"),
        pytest.param({"status": AccountStatus.BANNED}, id="banned"),
        pytest.param({"deleted_at": NOW}, id="deleted"),
    ],
)
async def test_tg598_c4_a_blocked_account_gets_the_apod_and_registers_nothing(
    blocked: dict[str, object],
) -> None:
    async for env in _build(user=ME.model_copy(update=blocked)):
        response = await env.client.get("/api/apod", headers=env.auth_headers)

        assert response.status_code == 200
        assert response.json()["date"] == "2026-10-14"
        assert env.repo.calls == 0
        assert env.repo.streaks == {}


async def test_tg598_c5_registering_does_not_change_the_response_or_the_apod_calls(
    env: Env,
) -> None:
    anonymous = await env.client.get("/api/apod")
    with_session = await env.client.get("/api/apod", headers=env.auth_headers)

    assert env.repo.calls == 1  # the second one registered
    assert with_session.status_code == anonymous.status_code == 200
    assert with_session.json() == anonymous.json()
    # The APOD provider (which owns the cache) is asked exactly as without session.
    assert env.provider.requested == [None, None]


def test_tg598_c6_openapi_keeps_the_endpoint_public() -> None:
    app = FastAPI()
    app.include_router(router, prefix="/api")

    operation = app.openapi()["paths"]["/api/apod"]["get"]

    assert "401" not in operation["responses"]
    assert "403" not in operation["responses"]
    assert "200" in operation["responses"]
    # The token is not a required parameter of the operation.
    assert all(p["name"] != "authorization" for p in operation.get("parameters", []))


def test_tg598_c6_openapi_does_not_make_the_session_mandatory() -> None:
    app = FastAPI()
    app.include_router(router, prefix="/api")

    operation = app.openapi()["paths"]["/api/apod"]["get"]

    # Optional session: either no security requirement, or one that allows {}.
    security = operation.get("security")
    assert security is None or {} in security
