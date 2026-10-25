"""GET /api/apod over the full app. TG-116 (US TG-47).

create_app() with its lifespan, middleware and error handlers, the real
NasaApodProvider over PostgreSQL and Redis, and the NASA simulated with respx.
"""

import json
import os
from collections.abc import AsyncIterator, Iterator
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import respx
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text

from alembic import command
from app.application.apod.errors import APOD_UNAVAILABLE
from app.infrastructure.apod.nasa_client import APOD_URL
from app.infrastructure.apod.nasa_feed_client import FEED_URL
from app.infrastructure.apod.repository import SqlApodRepository
from app.infrastructure.scheduler.dependencies import get_scheduler_settings
from app.main import create_app
from tests.factories.apod import make_apod

pytestmark = pytest.mark.skipif(
    not (os.getenv("REDIS_HOST") and os.getenv("POSTGRES_HOST")),
    reason="APOD API integration requires REDIS_HOST and POSTGRES_HOST",
)

API_KEY = "test-nasa-api-key-tg116"
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
PROBLEM_JSON = "application/problem+json"


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def _migrated() -> None:
    # Sync on purpose: env.py runs the migrations with asyncio.run.
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
def _env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    # The lifespan also builds the auth service (TG-44), which requires these.
    monkeypatch.setenv("GOOGLE_CLIENT_IDS", "test.apps.googleusercontent.com")
    monkeypatch.setenv("JWT_SECRET", "t" * 32)
    monkeypatch.setenv("NASA_API_KEY", API_KEY)
    get_scheduler_settings.cache_clear()
    yield
    get_scheduler_settings.cache_clear()


async def _clear_apod_state(app: FastAPI) -> None:
    async with app.state.session_factory() as session:
        await session.execute(text("TRUNCATE apod"))
        await session.commit()
    async for key in app.state.redis.scan_iter(match="cache:apod:*"):
        await app.state.redis.delete(key)


@pytest.fixture
async def app(_migrated: None, _env: None) -> AsyncIterator[FastAPI]:
    app = create_app()
    async with app.router.lifespan_context(app):
        await _clear_apod_state(app)
        try:
            yield app
        finally:
            await _clear_apod_state(app)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


@pytest.fixture
def nasa() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        # The feed is tried first: down here, so these tests keep using the API.
        router.get(FEED_URL).respond(503)
        yield router


def assert_problem(response: Response, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM_JSON
    body: dict[str, Any] = response.json()
    assert body["code"] == code
    assert response.headers["X-Correlation-ID"] == body["correlation_id"]
    return body


async def test_tg47_c2_without_date_asks_nasa_for_today(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    route = nasa.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    response = await client.get("/api/apod")

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"
    assert route.call_count == 1
    assert "date" not in route.calls.last.request.url.params


async def test_tg47_c3_past_date_returns_that_apod(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    route = nasa.get(APOD_URL).respond(json=fixture("nasa_apod_video.json"))

    response = await client.get("/api/apod", params={"date": "2026-10-15"})

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-15"
    assert route.calls.last.request.url.params["date"] == "2026-10-15"


async def test_tg47_c4_response_has_the_agreed_fields(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    nasa.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    response = await client.get("/api/apod", params={"date": "2026-10-14"})

    assert response.status_code == 200
    assert response.json() == {
        "date": "2026-10-14",
        "title": "The Orion Nebula",
        "explanation": "A stellar nursery about 1,300 light-years away.",
        "media_type": "image",
        "url": "https://apod.nasa.gov/apod/image/2610/orion.jpg",
        "copyright": "Jane Doe",
    }


async def test_tg47_c4_copyright_is_null_when_nasa_sends_none(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    nasa.get(APOD_URL).respond(json=fixture("nasa_apod_video.json"))

    response = await client.get("/api/apod", params={"date": "2026-10-15"})

    assert response.status_code == 200
    assert response.json()["media_type"] == "video"
    assert response.json()["copyright"] is None


async def test_tg47_c5_api_key_goes_to_nasa_but_never_to_the_client(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    route = nasa.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    response = await client.get("/api/apod", params={"date": "2026-10-14"})

    request = route.calls.last.request
    assert request.headers["X-Api-Key"] == API_KEY
    assert API_KEY not in str(request.url)
    assert API_KEY not in response.text
    assert API_KEY not in str(response.headers)


async def test_tg47_c5_api_key_is_not_in_the_error_detail(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    nasa.get(APOD_URL).respond(500, text=f"upstream error for {API_KEY}")

    response = await client.get("/api/apod", params={"date": "2026-10-14"})

    body = assert_problem(response, 503, APOD_UNAVAILABLE)
    assert API_KEY not in body["detail"]
    assert API_KEY not in response.text


@pytest.mark.parametrize(
    ("value", "code"),
    [
        ("14-10-2026", "VALIDATION_ERROR"),
        ("2999-01-01", "APOD_DATE_IN_FUTURE"),
        ("1995-06-15", "APOD_DATE_BEFORE_START"),
    ],
)
async def test_tg47_c6_invalid_date_returns_422_without_calling_nasa(
    client: AsyncClient, nasa: respx.MockRouter, value: str, code: str
) -> None:
    route = nasa.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    response = await client.get("/api/apod", params={"date": value})

    assert_problem(response, 422, code)
    assert route.call_count == 0


async def test_tg47_c6_nasa_down_without_stored_data_returns_503(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    nasa.get(APOD_URL).respond(500)

    response = await client.get("/api/apod")

    assert_problem(response, 503, APOD_UNAVAILABLE)


async def test_tg47_c6_nasa_down_with_stored_data_serves_it(
    app: FastAPI, client: AsyncClient, nasa: respx.MockRouter
) -> None:
    stored = make_apod(date(2026, 10, 14), copyright="Jane Doe")
    await SqlApodRepository(app.state.session_factory).save(stored)
    route = nasa.get(APOD_URL).respond(500)

    response = await client.get("/api/apod")

    assert response.status_code == 200
    assert response.json()["date"] == "2026-10-14"
    assert response.json()["title"] == stored.title
    assert route.call_count == 1


async def test_tg47_c6_nasa_down_serves_the_cached_apod(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    route = nasa.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))
    await client.get("/api/apod", params={"date": "2026-10-14"})
    route.respond(500)

    response = await client.get("/api/apod", params={"date": "2026-10-14"})

    assert response.status_code == 200
    assert response.json()["title"] == "The Orion Nebula"
    assert route.call_count == 1


async def test_tg116_correlation_id_from_the_client_is_kept(
    client: AsyncClient, nasa: respx.MockRouter
) -> None:
    nasa.get(APOD_URL).respond(500)

    response = await client.get(
        "/api/apod", headers={"X-Correlation-ID": "tg116-trace-1"}
    )

    body = assert_problem(response, 503, APOD_UNAVAILABLE)
    assert body["correlation_id"] == "tg116-trace-1"
