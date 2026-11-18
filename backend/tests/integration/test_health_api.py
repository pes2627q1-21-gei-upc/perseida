"""GET /api/health. US TG-49: PostgreSQL (critical) and Redis (optional).

Tests without a skip build the app with its real lifespan against ports where
PostgreSQL and Redis are unreachable, so they also run without Docker. The
``requires_services`` ones need the real PostgreSQL and Redis of the CI.
"""

import asyncio
import os
import time
from collections.abc import AsyncIterator, Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.application.health.health_service import HealthService
from app.infrastructure.health.dependencies import get_health_service
from app.infrastructure.scheduler.dependencies import get_scheduler_settings
from app.main import create_app
from tests.fakes.health import FakeHealthCheck

requires_services = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="Health integration requires POSTGRES_HOST and REDIS_HOST",
)

# Each check is cut at 2 s and they run in parallel (TG-49 criterion 3).
MAX_HEALTH_SECONDS = 3.5
UNREACHABLE_PORT = "1"


@pytest.fixture(autouse=True)
def _scheduler_disabled(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    # The scheduler has its own lifecycle tests; here only app, postgres and redis.
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    get_scheduler_settings.cache_clear()
    yield
    get_scheduler_settings.cache_clear()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


@pytest.fixture
def app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Settings the lifespan needs besides PostgreSQL and Redis."""
    for key, value in {
        "GOOGLE_CLIENT_IDS": "test.apps.googleusercontent.com",
        "JWT_SECRET": "t" * 32,
        "NASA_API_KEY": "test-nasa-api-key",
    }.items():
        monkeypatch.setenv(key, value)


@pytest.fixture
def service_env(app_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """PostgreSQL and Redis on a port where nothing listens."""
    for key, value in {
        "POSTGRES_DB": "test",
        "POSTGRES_USER": "test",
        "POSTGRES_PASSWORD": "test",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": UNREACHABLE_PORT,
        "REDIS_HOST": "127.0.0.1",
        "REDIS_PORT": UNREACHABLE_PORT,
    }.items():
        monkeypatch.setenv(key, value)


@pytest.fixture
async def silent_port() -> AsyncIterator[int]:
    """A TCP port that accepts connections and never answers (a hung server)."""
    writers: list[asyncio.StreamWriter] = []

    async def hang(_reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writers.append(writer)

    server = await asyncio.start_server(hang, "127.0.0.1", 0)
    try:
        port: int = server.sockets[0].getsockname()[1]
        yield port
    finally:
        for writer in writers:
            writer.close()
        server.close()
        await server.wait_closed()


async def _get_health(app: FastAPI) -> tuple[int, Any, float]:
    """GET /api/health inside the real lifespan: status, body and seconds."""
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http,
    ):
        started = time.perf_counter()
        response = await http.get("/api/health")
        elapsed = time.perf_counter() - started
    return response.status_code, response.json(), elapsed


async def test_tg49_c4_health_is_public_and_keeps_its_shape(
    app: FastAPI, client: AsyncClient
) -> None:
    app.dependency_overrides[get_health_service] = lambda: HealthService(
        [
            FakeHealthCheck("app"),
            FakeHealthCheck("postgres"),
            FakeHealthCheck("redis", critical=False),
        ]
    )

    # No Authorization header: the endpoint is public.
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "components": {"app": "ok", "postgres": "ok", "redis": "ok"},
    }


async def test_health_reports_down_component_with_override(
    app: FastAPI, client: AsyncClient
) -> None:
    app.dependency_overrides[get_health_service] = lambda: HealthService(
        [FakeHealthCheck("app"), FakeHealthCheck("db", up=False)]
    )

    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "down",
        "components": {"app": "ok", "db": "down"},
    }


async def test_tg49_c2_health_with_a_non_critical_component_down_is_ok(
    app: FastAPI, client: AsyncClient
) -> None:
    app.dependency_overrides[get_health_service] = lambda: HealthService(
        [
            FakeHealthCheck("app"),
            FakeHealthCheck("postgres"),
            FakeHealthCheck("redis", up=False, critical=False),
        ]
    )

    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "components": {"app": "ok", "postgres": "ok", "redis": "down"},
    }


async def test_tg49_c3_health_answers_when_postgres_and_redis_are_unreachable(
    app: FastAPI, service_env: None
) -> None:
    status_code, body, elapsed = await _get_health(app)

    assert status_code == 200
    assert body == {
        "status": "down",
        "components": {"app": "ok", "postgres": "down", "redis": "down"},
    }
    assert elapsed < MAX_HEALTH_SECONDS


async def test_tg49_c3_health_cuts_hung_postgres_and_redis_at_the_timeout(
    app: FastAPI,
    service_env: None,
    silent_port: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTGRES_PORT", str(silent_port))
    monkeypatch.setenv("REDIS_PORT", str(silent_port))

    status_code, body, elapsed = await _get_health(app)

    assert status_code == 200
    assert body == {
        "status": "down",
        "components": {"app": "ok", "postgres": "down", "redis": "down"},
    }
    assert elapsed < MAX_HEALTH_SECONDS


@requires_services
async def test_tg49_c1_health_is_ok_with_real_postgres_and_redis(
    app: FastAPI, app_env: None
) -> None:
    status_code, body, _ = await _get_health(app)

    assert status_code == 200
    assert body == {
        "status": "ok",
        "components": {"app": "ok", "postgres": "ok", "redis": "ok"},
    }


@requires_services
async def test_tg49_c2_health_stays_ok_when_redis_is_down(
    app: FastAPI, app_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REDIS_PORT", UNREACHABLE_PORT)

    status_code, body, _ = await _get_health(app)

    assert status_code == 200
    assert body == {
        "status": "ok",
        "components": {"app": "ok", "postgres": "ok", "redis": "down"},
    }


@requires_services
async def test_tg49_c1_health_is_down_when_postgres_is_down(
    app: FastAPI, app_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("POSTGRES_PORT", UNREACHABLE_PORT)

    status_code, body, elapsed = await _get_health(app)

    assert status_code == 200
    assert body == {
        "status": "down",
        "components": {"app": "ok", "postgres": "down", "redis": "ok"},
    }
    assert elapsed < MAX_HEALTH_SECONDS


async def test_openapi_documents_health(client: AsyncClient) -> None:
    response = await client.get("/api/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/api/health" in schema["paths"]
    assert "HealthResponse" in schema["components"]["schemas"]


async def test_tg49_c4_openapi_health_has_no_security(client: AsyncClient) -> None:
    response = await client.get("/api/openapi.json")

    operation = response.json()["paths"]["/api/health"]["get"]
    assert "security" not in operation


async def test_docs_are_served(client: AsyncClient) -> None:
    response = await client.get("/api/docs")

    assert response.status_code == 200


async def test_lifespan_starts_and_stops(
    app: FastAPI, service_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = MagicMock()
    engine.dispose = AsyncMock()
    monkeypatch.setattr(main_module, "create_async_engine", lambda *a, **k: engine)

    async with app.router.lifespan_context(app):
        assert app.state.session_factory is not None
        assert app.state.auth_service is not None

    engine.dispose.assert_awaited_once()


async def test_app_starts_without_postgres_available(
    app: FastAPI, service_env: None
) -> None:
    # Nothing listens on port 1: the engine is lazy, so startup must not connect.
    async with app.router.lifespan_context(app):
        assert app.state.session_factory is not None
