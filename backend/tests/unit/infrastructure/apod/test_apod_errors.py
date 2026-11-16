"""Error responses of GET /api/apod. TG-115 (US TG-47)."""

import uuid
from collections.abc import AsyncIterator
from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.apod.apod_service import ApodService
from app.application.apod.errors import APOD_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.apod.rules import FIRST_APOD_DATE
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.apod.dependencies import get_apod_service
from app.infrastructure.apod.router import router
from tests.factories.apod import make_apod
from tests.fakes.apod import FakeApodProvider

TODAY = date(2026, 10, 14)
PROBLEM_JSON = "application/problem+json"


def build_app(provider: FakeApodProvider) -> FastAPI:
    # Router and handlers only, not create_app(): the full-app flow is TG-116.
    app = FastAPI()
    app.include_router(router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_apod_service] = lambda: ApodService(
        provider, today=lambda: TODAY
    )
    return app


@pytest.fixture
def provider() -> FakeApodProvider:
    return FakeApodProvider([make_apod(FIRST_APOD_DATE), make_apod(TODAY)], TODAY)


@pytest.fixture
async def client(provider: FakeApodProvider) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=build_app(provider)), base_url="http://test"
    ) as http:
        yield http


def assert_problem(response: Response, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM_JSON
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert body["code"] == code
    assert body["instance"] == "/api/apod"
    assert uuid.UUID(body["correlation_id"])
    assert response.headers["X-Correlation-ID"] == body["correlation_id"]
    return body


@pytest.mark.parametrize(
    "value",
    [
        "abc",
        "",
        "2026-13-01",
        "2026-02-30",
        "2026-10-1",
        "20261014",
        "14-10-2026",
        "1760659200",
        "2026-10-14T00:00:00",
        "2026-10-14 ",
        "2026-10-14\n",
        "٢٠٢٦-١٠-١٤",
    ],
)
async def test_malformed_date_returns_validation_error(
    client: AsyncClient, provider: FakeApodProvider, value: str
) -> None:
    response = await client.get("/api/apod", params={"date": value})

    body = assert_problem(response, 422, "VALIDATION_ERROR")
    (error,) = body["errors"]
    assert error["field"] == "date"
    assert provider.requested == []


async def test_future_date_returns_apod_date_in_future(
    client: AsyncClient, provider: FakeApodProvider
) -> None:
    response = await client.get("/api/apod", params={"date": "2026-10-15"})

    body = assert_problem(response, 422, "APOD_DATE_IN_FUTURE")
    assert "errors" not in body
    assert provider.requested == []


async def test_date_before_start_returns_apod_date_before_start(
    client: AsyncClient, provider: FakeApodProvider
) -> None:
    response = await client.get("/api/apod", params={"date": "1995-06-15"})

    body = assert_problem(response, 422, "APOD_DATE_BEFORE_START")
    assert "errors" not in body
    assert provider.requested == []


@pytest.mark.parametrize("day", [FIRST_APOD_DATE, TODAY])
async def test_range_limits_are_valid(
    client: AsyncClient, provider: FakeApodProvider, day: date
) -> None:
    response = await client.get("/api/apod", params={"date": day.isoformat()})

    assert response.status_code == 200
    assert response.json()["date"] == day.isoformat()
    assert provider.requested == [day]


@pytest.mark.parametrize("params", [{}, {"date": "2026-10-14"}])
async def test_unavailable_provider_returns_apod_unavailable(
    params: dict[str, str],
) -> None:
    failing = FakeApodProvider(
        [],
        TODAY,
        failure=ExternalServiceError(APOD_UNAVAILABLE, "NASA API unreachable"),
    )
    async with AsyncClient(
        transport=ASGITransport(app=build_app(failing)), base_url="http://test"
    ) as http:
        response = await http.get("/api/apod", params=params)

    body = assert_problem(response, 503, "APOD_UNAVAILABLE")
    assert body["detail"] == "NASA API unreachable"
    assert "errors" not in body
