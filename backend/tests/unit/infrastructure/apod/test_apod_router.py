from collections.abc import AsyncIterator
from datetime import date

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.apod.apod_service import ApodService
from app.domain.apod.models import MediaType
from app.infrastructure.apod.dependencies import get_apod_service
from app.infrastructure.apod.router import ApodResponse, router
from tests.factories.apod import make_apod
from tests.fakes.apod import FakeApodProvider

TODAY = date(2026, 10, 14)
PAST = date(2026, 10, 1)


def test_from_apod_maps_entity_fields_to_the_api_names() -> None:
    apod = make_apod(apod_date=PAST, media_type=MediaType.VIDEO, copyright="Jane Doe")

    response = ApodResponse.from_apod(apod)

    assert response.model_dump(mode="json") == {
        "date": "2026-10-01",
        "title": apod.title,
        "explanation": apod.explanation,
        "media_type": "video",
        "url": apod.media_url,
        "copyright": "Jane Doe",
    }


def test_from_apod_without_copyright_keeps_it_null() -> None:
    assert ApodResponse.from_apod(make_apod()).copyright is None


@pytest.fixture
def provider() -> FakeApodProvider:
    return FakeApodProvider([make_apod(TODAY), make_apod(PAST)], today=TODAY)


@pytest.fixture
def app(provider: FakeApodProvider) -> FastAPI:
    # Router only, not create_app(): the full-app flow is TG-116.
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_apod_service] = lambda: ApodService(
        provider, today=lambda: TODAY
    )
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


async def test_get_apod_without_date_returns_today(
    client: AsyncClient, provider: FakeApodProvider
) -> None:
    response = await client.get("/api/apod")

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"
    assert provider.requested == [None]


async def test_get_apod_with_date_returns_that_day(
    client: AsyncClient, provider: FakeApodProvider
) -> None:
    response = await client.get("/api/apod", params={"date": "2026-10-01"})

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-01"
    assert provider.requested == [PAST]


def test_openapi_documents_the_optional_date_parameter(app: FastAPI) -> None:
    operation = app.openapi()["paths"]["/api/apod"]["get"]

    (parameter,) = operation["parameters"]
    assert parameter["name"] == "date"
    assert parameter["in"] == "query"
    assert parameter["required"] is False
