"""GET /api/meeting-points (TG-352 criteris 1, 4 i 5).

Service wired with in-memory fakes; the real auth flow, as in the
subscriptions router tests.
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime
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
from app.application.meeting_points.errors import MEETING_POINTS_UNAVAILABLE
from app.application.meeting_points.meeting_point_service import MeetingPointService
from app.application.shared.errors import ExternalServiceError
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.domain.meeting_points.models import MeetingPointProfile
from app.domain.shared.location import Location
from app.domain.users.models import AccountStatus, User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.meeting_points import router as meeting_points_router
from app.infrastructure.meeting_points.dependencies import get_meeting_point_service
from app.infrastructure.meeting_points.schemas import MeetingPointResponse
from app.infrastructure.users.dependencies import get_user_service
from app.main import create_app
from tests.factories.meeting_points import EXAMPLE_SPACES, make_space
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.cache import FakeCache
from tests.fakes.meeting_points import FakeSpaceSearch
from tests.fakes.users import InMemoryUserRepository

PROBLEM_JSON = "application/problem+json"
PATH = "/api/meeting-points"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
ME = User.create(google_sub="google-123", email="ana@example.com", display_name="Ana")
TOKEN = "secret-spotwise-token-123"
WATCH_PARTY = {"profile": "watch_party", "lat": "41.40449", "lon": "2.17123"}

LIBRARY_12_JSON = {
    "id": 12,
    "name": "Biblioteca d'exemple Sagrada Família",
    "type": "library",
    "address": "Carrer d'Exemple, 1, 08025 Barcelona",
    "location": {"latitude": 41.4045, "longitude": 2.1712},
    "wifi": True,
    "silence_level": "murmur",
    "plugs": "many",
    "group_friendly": True,
    "distance_m": 290,
    "open_now": True,
}


async def _client(
    search: FakeSpaceSearch, me: User = ME
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    auth = AuthService(
        FakeGoogleTokenVerifier(IDENTITY),
        FakeTokenCodec(),
        InMemorySessionStore(),
        FakeAccountGateway(),
        DURATIONS,
    )
    app = FastAPI()
    app.include_router(meeting_points_router.router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_user_service] = lambda: UserService(
        InMemoryUserRepository(me)
    )
    service = MeetingPointService(search, FakeCache())
    app.dependency_overrides[get_meeting_point_service] = lambda: service
    tokens = await auth.login("google-id-token")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, {"Authorization": f"Bearer {tokens.access_token}"}


def _assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


# --- 200 ------------------------------------------------------------------------


async def test_tg352_c4_watch_party_returns_the_recommended_spaces() -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    async for client, auth in _client(search):
        response = await client.get(PATH, params=WATCH_PARTY, headers=auth)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == [LIBRARY_12_JSON]


async def test_tg352_c1_uses_the_user_location_and_the_profile() -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    async for client, auth in _client(search):
        await client.get(
            PATH,
            params={"profile": "study", "lat": "41.38506", "lon": "2.1734"},
            headers=auth,
        )

    ((near, profile),) = search.calls
    assert near == Location(latitude=41.385, longitude=2.173)
    assert profile.silence  # the study profile asks Spotwise for silence


async def test_tg352_c4_study_with_no_match_returns_an_empty_list() -> None:
    async for client, auth in _client(FakeSpaceSearch(EXAMPLE_SPACES)):
        response = await client.get(
            PATH, params={**WATCH_PARTY, "profile": "study"}, headers=auth
        )

    assert response.status_code == 200
    assert response.json() == []


async def test_tg352_c4_nulls_are_kept_in_the_answer() -> None:
    # Silent, so the study profile keeps it; the other votes are missing.
    space = make_space(
        id=5,
        plugs=None,
        group_friendly=None,
        open_now=None,
        address="",
    )
    async for client, auth in _client(FakeSpaceSearch([space])):
        response = await client.get(
            PATH, params={**WATCH_PARTY, "profile": "study"}, headers=auth
        )

    assert response.status_code == 200, response.text
    (body,) = response.json()
    assert body["silence_level"] == "silent"
    assert body["plugs"] is None
    assert body["group_friendly"] is None
    assert body["open_now"] is None
    assert body["address"] == ""
    assert body["type"] == "cafe"


async def test_tg352_c4_an_unknown_silence_level_is_null() -> None:
    space = make_space(id=6, silence=None)
    async for client, auth in _client(FakeSpaceSearch([space])):
        response = await client.get(PATH, params=WATCH_PARTY, headers=auth)

    assert response.status_code == 200, response.text
    (body,) = response.json()
    assert body["silence_level"] is None


@pytest.mark.parametrize("profile", [p.value for p in MeetingPointProfile])
async def test_tg352_c4_both_profiles_are_accepted(profile: str) -> None:
    async for client, auth in _client(FakeSpaceSearch()):
        response = await client.get(
            PATH, params={**WATCH_PARTY, "profile": profile}, headers=auth
        )

    assert response.status_code == 200


# --- 401 / 403 ------------------------------------------------------------------


async def test_tg352_requires_a_session() -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    async for client, _ in _client(search):
        response = await client.get(PATH, params=WATCH_PARTY)

    _assert_problem(response, 401, INVALID_SESSION)
    assert search.calls == []


async def test_tg352_an_invalid_token_is_401() -> None:
    async for client, _ in _client(FakeSpaceSearch()):
        response = await client.get(
            PATH, params=WATCH_PARTY, headers={"Authorization": "Bearer nope"}
        )

    _assert_problem(response, 401, INVALID_SESSION)


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"status": AccountStatus.SUSPENDED}, ACCOUNT_SUSPENDED),
        ({"deleted_at": datetime(2026, 10, 1, tzinfo=UTC)}, ACCOUNT_DELETED),
    ],
)
async def test_tg352_a_suspended_or_deleted_account_is_403(
    overrides: dict[str, object], code: str
) -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    async for client, auth in _client(search, me=ME.model_copy(update=overrides)):
        response = await client.get(PATH, params=WATCH_PARTY, headers=auth)

    _assert_problem(response, 403, code)
    assert search.calls == []


# --- 422 ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "params",
    [
        {**WATCH_PARTY, "profile": "party"},
        {**WATCH_PARTY, "profile": ""},
        {"lat": "41.4", "lon": "2.17"},
        {"profile": "study", "lon": "2.17"},
        {"profile": "study", "lat": "41.4"},
        {**WATCH_PARTY, "lat": "90.1"},
        {**WATCH_PARTY, "lat": "-90.1"},
        {**WATCH_PARTY, "lon": "180.1"},
        {**WATCH_PARTY, "lon": "-180.1"},
        {**WATCH_PARTY, "lat": "nord"},
    ],
    ids=[
        "unknown-profile",
        "empty-profile",
        "no-profile",
        "no-lat",
        "no-lon",
        "lat-too-big",
        "lat-too-small",
        "lon-too-big",
        "lon-too-small",
        "lat-not-a-number",
    ],
)
async def test_tg352_c1_invalid_query_is_422(params: dict[str, Any]) -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    async for client, auth in _client(search):
        response = await client.get(PATH, params=params, headers=auth)

    _assert_problem(response, 422, "VALIDATION_ERROR")
    assert search.calls == []


@pytest.mark.parametrize(("lat", "lon"), [("90", "180"), ("-90", "-180"), ("0", "0")])
async def test_tg352_c1_location_limits_are_accepted(lat: str, lon: str) -> None:
    async for client, auth in _client(FakeSpaceSearch()):
        response = await client.get(
            PATH, params={"profile": "study", "lat": lat, "lon": lon}, headers=auth
        )

    assert response.status_code == 200


# --- 503 ------------------------------------------------------------------------


async def test_tg352_c5_spotwise_down_is_503_problem_never_500() -> None:
    failure = ExternalServiceError(MEETING_POINTS_UNAVAILABLE)
    async for client, auth in _client(FakeSpaceSearch(failure=failure)):
        response = await client.get(PATH, params=WATCH_PARTY, headers=auth)

    _assert_problem(response, 503, MEETING_POINTS_UNAVAILABLE)
    assert TOKEN not in response.text


# --- OpenAPI --------------------------------------------------------------------


def _operation() -> dict[str, Any]:
    operation: dict[str, Any] = create_app().openapi()["paths"][PATH]["get"]
    return operation


def test_tg352_openapi_documents_the_operation() -> None:
    operation = _operation()

    assert operation["operationId"] == "list_meeting_points"
    assert operation["tags"] == ["meeting-points"]
    parameters = {p["name"]: p for p in operation["parameters"]}
    assert set(parameters) == {"profile", "lat", "lon"}
    assert all(p["in"] == "query" and p["required"] for p in parameters.values())


def test_tg352_openapi_200_is_an_array_of_meeting_points() -> None:
    content = _operation()["responses"]["200"]["content"]

    assert set(content) == {"application/json"}
    assert content["application/json"]["schema"]["type"] == "array"
    assert content["application/json"]["schema"]["items"] == {
        "$ref": "#/components/schemas/MeetingPointResponse"
    }


def test_tg352_openapi_errors_are_problem_json_and_503_cites_its_code() -> None:
    responses = _operation()["responses"]

    for code in ("401", "422", "503"):
        assert set(responses[code]["content"]) == {PROBLEM_JSON}
    assert MEETING_POINTS_UNAVAILABLE in responses["503"]["description"]


def test_tg352_openapi_distance_m_is_a_required_integer() -> None:
    schema = create_app().openapi()["components"]["schemas"]["MeetingPointResponse"]

    assert "distance_m" in schema["required"]
    assert schema["properties"]["distance_m"]["type"] == "integer"
    assert "anyOf" not in schema["properties"]["distance_m"]


def test_tg352_a_space_without_distance_cannot_be_answered() -> None:
    # recommend drops them; reaching the response would be a bug.
    with pytest.raises(ValueError, match="distance"):
        MeetingPointResponse.of(make_space(distance_m=None))
