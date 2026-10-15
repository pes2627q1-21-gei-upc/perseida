from collections.abc import AsyncIterator, Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.application.health.health_service import HealthService
from app.infrastructure.health.dependencies import get_health_service
from app.main import create_app
from tests.fakes.health import FakeHealthCheck


@pytest.fixture(autouse=True)
def _scheduler_disabled(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    # The scheduler has its own lifecycle tests; here only the app check is covered.
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    get_health_service.cache_clear()
    yield
    get_health_service.cache_clear()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "components": {"app": "ok"}}


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


async def test_openapi_documents_health(client: AsyncClient) -> None:
    response = await client.get("/api/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/api/health" in schema["paths"]
    assert "HealthResponse" in schema["components"]["schemas"]


async def test_docs_are_served(client: AsyncClient) -> None:
    response = await client.get("/api/docs")

    assert response.status_code == 200


@pytest.fixture
def db_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in {
        "POSTGRES_DB": "test",
        "POSTGRES_USER": "test",
        "POSTGRES_PASSWORD": "test",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": "1",
    }.items():
        monkeypatch.setenv(key, value)


async def test_lifespan_starts_and_stops(
    app: FastAPI, db_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = MagicMock()
    engine.dispose = AsyncMock()
    monkeypatch.setattr(main_module, "create_async_engine", lambda *a, **k: engine)

    async with app.router.lifespan_context(app):
        assert app.state.session_factory is not None

    engine.dispose.assert_awaited_once()


async def test_app_starts_without_postgres_available(
    app: FastAPI, db_env: None
) -> None:
    # Nothing listens on port 1: the engine is lazy, so startup must not connect.
    async with app.router.lifespan_context(app):
        assert app.state.session_factory is not None
