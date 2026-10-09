from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.health.health_service import HealthService
from app.infrastructure.health.dependencies import get_health_service
from app.main import create_app
from tests.fakes.health import FakeHealthCheck


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
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "components": {"app": "ok"}}


async def test_health_reports_down_component_with_override(
    app: FastAPI, client: AsyncClient
) -> None:
    app.dependency_overrides[get_health_service] = lambda: HealthService(
        [FakeHealthCheck("app"), FakeHealthCheck("db", up=False)]
    )

    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "down",
        "components": {"app": "ok", "db": "down"},
    }


async def test_openapi_documents_health(client: AsyncClient) -> None:
    response = await client.get("/api/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "/health" in schema["paths"]
    assert "HealthResponse" in schema["components"]["schemas"]


async def test_docs_are_served(client: AsyncClient) -> None:
    response = await client.get("/api/docs")

    assert response.status_code == 200


async def test_lifespan_starts_and_stops(app: FastAPI) -> None:
    async with app.router.lifespan_context(app):
        pass
