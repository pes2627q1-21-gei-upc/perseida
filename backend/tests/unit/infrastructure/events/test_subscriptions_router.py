"""Subscriptions API: PUT/DELETE /api/events/{id}/subscription and
GET /api/me/subscriptions (TG-53, criteris 2-5 i 9).

Services wired with in-memory fakes; the real auth flow, as in the users router.
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.application.events import subscription_service
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.users.models import AccountStatus, User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.events import subscriptions_router
from app.infrastructure.events.dependencies import get_subscription_service
from app.infrastructure.events.schemas import EventResponse
from app.infrastructure.users.dependencies import get_user_service
from app.main import create_app
from tests.factories.events import make_event
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.event_subscriptions import InMemoryEventSubscriptionRepository
from tests.fakes.events import FakeEventRepository
from tests.fakes.users import InMemoryUserRepository

PROBLEM_JSON = "application/problem+json"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)

ME = User.create(google_sub="google-123", email="ana@example.com", display_name="Ana")
OTHER = User.create(
    google_sub="google-999", email="bob@example.com", display_name="Bob"
)
UPCOMING = make_event(NOW + timedelta(days=2))
SOONER = make_event(NOW + timedelta(hours=3))
ENDED = make_event(NOW - timedelta(days=1), NOW - timedelta(microseconds=1))
UNKNOWN_ID = uuid.UUID("01a1bd9a-ffff-7000-8000-000000000000")
EVENTS = (UPCOMING, SOONER, ENDED)


def _subscription_path(event_id: uuid.UUID | str) -> str:
    return f"/api/events/{event_id}/subscription"


async def _client(
    subscriptions: InMemoryEventSubscriptionRepository, me: User = ME
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    auth = AuthService(
        FakeGoogleTokenVerifier(IDENTITY),
        FakeTokenCodec(),
        InMemorySessionStore(),
        FakeAccountGateway(),
        DURATIONS,
    )
    app = FastAPI()
    app.include_router(subscriptions_router.router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_user_service] = lambda: UserService(
        InMemoryUserRepository(me, OTHER)
    )
    app.dependency_overrides[get_subscription_service] = lambda: (
        subscription_service.SubscriptionService(
            FakeEventRepository(EVENTS), subscriptions, now=lambda: NOW
        )
    )
    tokens = await auth.login("google-id-token")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, {"Authorization": f"Bearer {tokens.access_token}"}


def _repository(
    *subscribed: tuple[User, AstronomicalEvent],
) -> InMemoryEventSubscriptionRepository:
    earlier = NOW - timedelta(days=2)
    return InMemoryEventSubscriptionRepository(
        EVENTS,
        [
            EventSubscription.create(user.id, event, earlier)
            for user, event in subscribed
        ],
    )


def _assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


def _json(event: AstronomicalEvent) -> dict[str, Any]:
    return EventResponse.model_validate(event, from_attributes=True).model_dump(
        mode="json"
    )


_ENDPOINTS = [
    pytest.param("PUT", _subscription_path(UPCOMING.id), id="put"),
    pytest.param("DELETE", _subscription_path(UPCOMING.id), id="delete"),
    pytest.param("GET", "/api/me/subscriptions", id="list"),
]


@pytest.mark.parametrize(("method", "path"), _ENDPOINTS)
@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_tg53_c5_subscription_endpoints_without_a_valid_session_are_401(
    method: str, path: str, headers: dict[str, str]
) -> None:
    repo = _repository((ME, UPCOMING))
    async for client, _ in _client(repo):
        response = await client.request(method, path, headers=headers)

    _assert_problem(response, 401, INVALID_SESSION)
    assert list(repo.subscriptions) == [(ME.id, UPCOMING.id)]


@pytest.mark.parametrize(("method", "path"), _ENDPOINTS)
@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"status": AccountStatus.SUSPENDED}, ACCOUNT_SUSPENDED),
        ({"status": AccountStatus.BANNED}, ACCOUNT_SUSPENDED),
        ({"deleted_at": datetime(2026, 10, 1, tzinfo=UTC)}, ACCOUNT_DELETED),
    ],
)
async def test_tg53_c5_a_suspended_banned_or_deleted_account_is_403(
    method: str, path: str, overrides: dict[str, object], code: str
) -> None:
    repo = _repository((ME, UPCOMING))
    async for client, auth in _client(repo, me=ME.model_copy(update=overrides)):
        response = await client.request(method, path, headers=auth)

    _assert_problem(response, 403, code)
    assert list(repo.subscriptions) == [(ME.id, UPCOMING.id)]


async def test_tg53_c2_put_subscribes_with_201_and_then_answers_200() -> None:
    repo = _repository()
    async for client, auth in _client(repo):
        first = await client.put(_subscription_path(UPCOMING.id), headers=auth)
        second = await client.put(_subscription_path(UPCOMING.id), headers=auth)

    assert first.status_code == 201
    assert second.status_code == 200
    assert list(repo.subscriptions) == [(ME.id, UPCOMING.id)]


async def test_tg53_c2_put_subscribes_the_user_of_the_session() -> None:
    repo = _repository((OTHER, UPCOMING))
    async for client, auth in _client(repo):
        response = await client.put(_subscription_path(UPCOMING.id), headers=auth)

    assert response.status_code == 201
    assert set(repo.subscriptions) == {(OTHER.id, UPCOMING.id), (ME.id, UPCOMING.id)}


async def test_tg53_c5_put_on_an_unknown_event_is_404() -> None:
    repo = _repository()
    async for client, auth in _client(repo):
        response = await client.put(_subscription_path(UNKNOWN_ID), headers=auth)

    _assert_problem(response, 404, "EVENT_NOT_FOUND")
    assert repo.subscriptions == {}


async def test_tg53_c5_put_on_an_ended_event_is_409() -> None:
    repo = _repository()
    async for client, auth in _client(repo):
        response = await client.put(_subscription_path(ENDED.id), headers=auth)

    _assert_problem(response, 409, "EVENT_ALREADY_ENDED")
    assert repo.subscriptions == {}


async def test_tg53_c5_put_on_an_ended_event_already_subscribed_is_409() -> None:
    # La comprovació d'acabat va abans que la d'idempotència (decisió del test).
    repo = _repository((ME, ENDED))
    async for client, auth in _client(repo):
        response = await client.put(_subscription_path(ENDED.id), headers=auth)

    _assert_problem(response, 409, "EVENT_ALREADY_ENDED")
    assert list(repo.subscriptions) == [(ME.id, ENDED.id)]


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
async def test_tg53_c5_a_malformed_event_id_is_422(method: str) -> None:
    async for client, auth in _client(_repository()):
        response = await client.request(
            method, _subscription_path("not-a-uuid"), headers=auth
        )

    _assert_problem(response, 422, "VALIDATION_ERROR")


async def test_tg53_c3_delete_unsubscribes_with_204_and_no_body() -> None:
    repo = _repository((ME, UPCOMING), (OTHER, UPCOMING))
    async for client, auth in _client(repo):
        response = await client.delete(_subscription_path(UPCOMING.id), headers=auth)

    assert response.status_code == 204
    assert response.content == b""
    assert list(repo.subscriptions) == [(OTHER.id, UPCOMING.id)]


async def test_tg53_c3_delete_is_idempotent() -> None:
    repo = _repository((ME, UPCOMING))
    async for client, auth in _client(repo):
        first = await client.delete(_subscription_path(UPCOMING.id), headers=auth)
        second = await client.delete(_subscription_path(UPCOMING.id), headers=auth)

    assert (first.status_code, second.status_code) == (204, 204)
    assert repo.subscriptions == {}


async def test_tg53_c3_delete_of_an_unknown_event_is_204() -> None:
    async for client, auth in _client(_repository()):
        response = await client.delete(_subscription_path(UNKNOWN_ID), headers=auth)

    assert response.status_code == 204


async def test_tg53_c4_list_returns_my_events_as_event_responses_by_start() -> None:
    repo = _repository((ME, UPCOMING), (ME, ENDED), (ME, SOONER), (OTHER, SOONER))
    async for client, auth in _client(repo):
        response = await client.get("/api/me/subscriptions", headers=auth)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == [_json(ENDED), _json(SOONER), _json(UPCOMING)]


async def test_tg53_c4_list_without_subscriptions_is_an_empty_array() -> None:
    async for client, auth in _client(_repository((OTHER, UPCOMING))):
        response = await client.get("/api/me/subscriptions", headers=auth)

    assert response.status_code == 200
    assert response.json() == []


_OPERATIONS = (
    ("/api/events/{event_id}/subscription", "put", {"200", "201", "404", "409"}),
    ("/api/events/{event_id}/subscription", "delete", {"204"}),
    ("/api/me/subscriptions", "get", {"200"}),
)


@pytest.mark.parametrize(("path", "method", "statuses"), _OPERATIONS)
def test_tg53_c9_the_app_publishes_the_endpoints_with_problem_json_errors(
    path: str, method: str, statuses: set[str]
) -> None:
    responses = create_app().openapi()["paths"][path][method]["responses"]

    assert statuses | {"401", "403"} <= set(responses)
    for code, response in responses.items():
        if not code.startswith("2"):
            assert set(response["content"]) == {PROBLEM_JSON}, code
