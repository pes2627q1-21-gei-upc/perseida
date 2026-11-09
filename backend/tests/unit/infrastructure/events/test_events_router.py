from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.events.event_service import EventService
from app.domain.events.models import Location
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.events.dependencies import get_event_service
from app.infrastructure.events.router import router
from tests.factories.events import make_event
from tests.fakes.events import FakeEventRepository

NOW = datetime(2026, 11, 17, 21, 30, tzinfo=UTC)
EVENT = make_event(
    NOW,
    NOW + timedelta(hours=2),
    location=Location(latitude=28.5618, longitude=-80.577),
)


@pytest.fixture
def repository() -> FakeEventRepository:
    return FakeEventRepository([EVENT])


@pytest.fixture
async def client(repository: FakeEventRepository) -> AsyncIterator[AsyncClient]:
    # Router only, with the error handlers to check the problem+json body.
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_event_service] = lambda: EventService(
        repository, now=lambda: NOW
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


async def test_tg351_c1_active_with_a_date_returns_the_events_of_that_day(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get("/api/events/active", params={"date": "2026-12-14"})

    assert response.status_code == 200
    assert repository.between == [
        (datetime(2026, 12, 14, tzinfo=UTC), datetime(2026, 12, 15, tzinfo=UTC))
    ]


async def test_tg351_c1_active_without_a_date_returns_todays_events(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get("/api/events/active")

    assert response.status_code == 200
    assert repository.between == [
        (datetime(2026, 11, 17, tzinfo=UTC), datetime(2026, 11, 18, tzinfo=UTC))
    ]


async def test_tg351_c3_events_are_a_json_array_with_the_contract_fields(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/events/active")

    assert response.json() == [
        {
            "id": str(EVENT.id),
            "title": EVENT.title,
            "summary": EVENT.summary,
            "category": "lunar",
            "starts_at": "2026-11-17T21:30:00Z",
            "ends_at": "2026-11-17T23:30:00Z",
            "location": {"latitude": 28.5618, "longitude": -80.577},
            "source_url": None,
        }
    ]


async def test_tg351_c2_upcoming_returns_the_events_of_the_next_days(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get("/api/events/upcoming", params={"days": 30})

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert repository.starting_between == [(NOW, NOW + timedelta(days=30))]


async def test_tg351_c2_upcoming_defaults_to_seven_days(
    client: AsyncClient, repository: FakeEventRepository
) -> None:
    response = await client.get("/api/events/upcoming")

    assert response.status_code == 200
    assert repository.starting_between == [(NOW, NOW + timedelta(days=7))]


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/events/active", {"date": "2026-1-5"}),
        ("/api/events/active", {"date": "2026-02-30"}),
        ("/api/events/active", {"date": "17/11/2026"}),
        ("/api/events/upcoming", {"days": "0"}),
        ("/api/events/upcoming", {"days": "31"}),
        ("/api/events/upcoming", {"days": "abc"}),
    ],
)
async def test_tg351_c4_invalid_parameters_return_a_422_problem(
    client: AsyncClient,
    repository: FakeEventRepository,
    path: str,
    params: dict[str, str],
) -> None:
    response = await client.get(path, params=params)

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert repository.between == repository.starting_between == []
