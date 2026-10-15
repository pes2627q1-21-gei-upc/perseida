import asyncio
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.infrastructure.health.dependencies import get_health_service
from app.infrastructure.scheduler.dependencies import get_job_scheduler
from app.main import create_app


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key, value in {
        "POSTGRES_DB": "test",
        "POSTGRES_USER": "test",
        "POSTGRES_PASSWORD": "test",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": "1",
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("SCHEDULER_ENABLED", raising=False)
    get_job_scheduler.cache_clear()
    get_health_service.cache_clear()
    yield
    get_job_scheduler.cache_clear()
    get_health_service.cache_clear()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


async def _health(app: FastAPI) -> dict[str, object]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    body: dict[str, object] = response.json()
    return body


async def test_scheduler_starts_and_stops_with_the_app(app: FastAPI) -> None:
    scheduler = get_job_scheduler()
    assert scheduler.running is False

    async with app.router.lifespan_context(app):
        assert scheduler.running is True

    assert scheduler.running is False


async def test_health_reports_the_scheduler_while_the_app_runs(app: FastAPI) -> None:
    async with app.router.lifespan_context(app):
        body = await _health(app)

    assert body == {"status": "ok", "components": {"app": "ok", "scheduler": "ok"}}


async def test_disabled_scheduler_is_not_started_nor_reported(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")

    async with app.router.lifespan_context(app):
        assert get_job_scheduler().running is False
        body = await _health(app)

    assert body == {"status": "ok", "components": {"app": "ok"}}


async def test_api_keeps_responding_while_a_job_runs(app: FastAPI) -> None:
    started = asyncio.Event()
    release = asyncio.Event()

    async def blocked() -> None:
        started.set()
        await release.wait()

    async with app.router.lifespan_context(app):
        get_job_scheduler().add_interval_job("blocked", blocked, seconds=0.05)
        await asyncio.wait_for(started.wait(), 3)

        body = await asyncio.wait_for(_health(app), 1)
        release.set()

    assert body["status"] == "ok"
