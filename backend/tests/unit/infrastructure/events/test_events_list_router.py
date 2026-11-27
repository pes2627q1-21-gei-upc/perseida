"""GET /api/events: the filtered list of events (TG-51, criteris 1, 2 i 4).

Router only, with the error handlers to check the problem+json body; the
service runs over the in-memory repository with a fixed clock.
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.events.event_service import EventService
from app.domain.events.models import EventCategory, Location, Proximity
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.events.dependencies import get_event_service
from app.infrastructure.events.router import router
from tests.factories.events import make_event
from tests.fakes.cache import FakeCache
from tests.fakes.events import FakeEventRepository

NOW = datetime(2026, 11, 17, 21, 30, tzinfo=UTC)
TODAY = datetime(2026, 11, 17, tzinfo=UTC)
BARCELONA = Location(latitude=41.3874, longitude=2.1686)
LATER = make_event(NOW + timedelta(days=3), category=EventCategory.LAUNCH)
SOONER = make_event(
    NOW,
    NOW + timedelta(hours=2),
    location=Location(latitude=28.5618, longitude=-80.577),
)


@pytest.fixture
def repository() -> FakeEventRepository:
    return FakeEventRepository([LATER, SOONER])


@pytest.fixture
def app(repository: FakeEventRepository) -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_event_service] = lambda: EventService(
        repository, [], FakeCache(), now=lambda: NOW
    )
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


async def test_tg51_c1_list_returns_the_events_sorted_by_start(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/events")

    assert response.status_code == 200
    assert [event["id"] for event in response.json()] == [
        str(SOONER.id),
        str(LATER.id),
    ]


async def test_tg51_c1_each_event_has_the_contract_fields(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/events")

    assert response.json()[0] == {
        "id": str(SOONER.id),
        "title": SOONER.title,
        "summary": SOONER.summary,
        "category": "lunar",
        "starts_at": "2026-11-17T21:30:00Z",
        "ends_at": "2026-11-17T23:30:00Z",
        "location": {"latitude": 28.5618, "longitude": -80.577},
        "source_url": None,
    }


async def test_tg51_c1_without_filters_lists_today_and_the_next_30_days(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    await client.get("/api/events")

    [query] = repository.searches
    assert query.start == TODAY
    assert query.end == TODAY + timedelta(days=31)
    assert query.categories == frozenset()
    assert query.near is None


async def test_tg51_c1_from_and_to_are_utc_days_with_to_included(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get(
        "/api/events", params={"from": "2026-12-13", "to": "2026-12-14"}
    )

    assert response.status_code == 200
    [query] = repository.searches
    assert query.start == datetime(2026, 12, 13, tzinfo=UTC)
    assert query.end == datetime(2026, 12, 15, tzinfo=UTC)


async def test_tg51_c1_category_can_be_repeated(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get(
        "/api/events", params=[("category", "lunar"), ("category", "meteor_shower")]
    )

    assert response.status_code == 200
    [query] = repository.searches
    assert query.categories == frozenset(
        {EventCategory.LUNAR, EventCategory.METEOR_SHOWER}
    )
    assert [event["id"] for event in response.json()] == [str(SOONER.id)]


async def test_tg51_c4_lat_and_lon_search_near_with_a_default_radius(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get(
        "/api/events", params={"lat": "41.3874", "lon": "2.1686"}
    )

    assert response.status_code == 200
    [query] = repository.searches
    assert query.near == Proximity(location=BARCELONA, radius_km=500)
    # SOONER is at Cape Canaveral; LATER has no location, so it stays.
    assert [event["id"] for event in response.json()] == [str(LATER.id)]


async def test_tg51_c4_radius_km_is_passed_on(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get(
        "/api/events", params={"lat": "41.3874", "lon": "2.1686", "radius_km": "100"}
    )

    assert response.status_code == 200
    [query] = repository.searches
    assert query.near == Proximity(location=BARCELONA, radius_km=100)


@pytest.mark.parametrize(
    "params",
    [
        {"lat": "41", "lon": "2", "radius_km": "1"},
        {"lat": "41", "lon": "2", "radius_km": "20000"},
        {"lat": "90", "lon": "180"},
        {"lat": "-90", "lon": "-180"},
        {"from": "2026-11-17", "to": "2027-02-15"},
        {"from": "2026-12-14", "to": "2026-12-14"},
    ],
    ids=[
        "radius-1",
        "radius-20000",
        "lat-lon-max",
        "lat-lon-min",
        "exactly-90-days",
        "one-day",
    ],
)
async def test_tg51_c1_limit_values_are_accepted(
    client: AsyncClient, params: dict[str, str]
) -> None:
    response = await client.get("/api/events", params=params)

    assert response.status_code == 200


@pytest.mark.parametrize(
    "params",
    [
        {"category": "comet"},
        {"lat": "90.1", "lon": "2"},
        {"lat": "-90.1", "lon": "2"},
        {"lat": "41", "lon": "180.1"},
        {"lat": "41", "lon": "-180.1"},
        {"lat": "41", "lon": "2", "radius_km": "0"},
        {"lat": "41", "lon": "2", "radius_km": "20001"},
        {"from": "2026-12-15", "to": "2026-12-14"},
        {"from": "2026-11-17", "to": "2027-02-16"},
        {"lat": "41"},
        {"lon": "2"},
        {"radius_km": "100"},
        {"from": "2026-1-5"},
        {"to": "2026-02-30"},
        {"from": "17/11/2026"},
        {"lat": "north", "lon": "2"},
    ],
    ids=[
        "unknown-category",
        "lat-over-90",
        "lat-under-minus-90",
        "lon-over-180",
        "lon-under-minus-180",
        "radius-0",
        "radius-20001",
        "from-after-to",
        "over-90-days",
        "lat-without-lon",
        "lon-without-lat",
        "radius-without-coordinates",
        "from-not-iso",
        "to-not-a-date",
        "from-other-format",
        "lat-not-a-number",
    ],
)
async def test_tg51_c2_invalid_filters_return_a_422_problem(
    client: AsyncClient, repository: FakeEventRepository, params: dict[str, str]
) -> None:
    response = await client.get("/api/events", params=params)

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 422
    assert body["code"] == "VALIDATION_ERROR"
    assert repository.searches == []


def _operation(app: FastAPI) -> dict[str, Any]:
    operation: dict[str, Any] = app.openapi()["paths"]["/api/events"]["get"]
    return operation


def test_tg51_c1_openapi_documents_list_events(app: FastAPI) -> None:
    operation = _operation(app)

    assert operation["operationId"] == "list_events"
    assert {"200", "422", "429", "500"} <= set(operation["responses"])
    assert "security" not in operation


def test_tg51_c1_openapi_documents_the_query_parameters(app: FastAPI) -> None:
    parameters = {p["name"]: p for p in _operation(app)["parameters"]}

    assert set(parameters) == {"category", "from", "to", "lat", "lon", "radius_km"}
    assert all(p["in"] == "query" for p in parameters.values())
    assert not any(p.get("required") for p in parameters.values())
    assert parameters["category"]["schema"]["type"] == "array"


def test_tg51_openapi_documents_the_proxy_rate_limit(app: FastAPI) -> None:
    # Same text as /active and /upcoming: the proxy limits the whole /api/events.
    paths = app.openapi()["paths"]
    limit = paths["/api/events"]["get"]["responses"]["429"]["description"]

    assert "600" in limit and "100" in limit and "Retry-After" in limit
    assert (
        limit == paths["/api/events/active"]["get"]["responses"]["429"]["description"]
    )
