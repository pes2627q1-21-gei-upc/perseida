"""Events endpoints for Spotwise against PostgreSQL for real (TG-351, task #478).

The whole chain runs: HTTP -> router -> EventService -> SqlEventRepository ->
PostgreSQL. The rows are the contract examples of `tests/fixtures/events/`, so
each response must be exactly those JSON documents: the format agreed with
Spotwise (see obsidian_vault/arquitectura/contracte-esdeveniments.md). Only the
clock is fixed, so `upcoming` is deterministic.
"""

import json
import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.application.events.event_service import EventService
from app.infrastructure.events.dependencies import get_event_service
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.events.tables import AstronomicalEventRow
from app.infrastructure.persistence.config import DatabaseSettings
from app.main import create_app

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "events"
NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
PROBLEM_JSON = "application/problem+json"


def _contract(name: str) -> dict[str, Any]:
    document: dict[str, Any] = json.loads(
        (FIXTURES / f"{name}.json").read_text(encoding="utf-8")
    )
    return document


def _row(event: dict[str, Any]) -> AstronomicalEventRow:
    location = event["location"]
    return AstronomicalEventRow(
        id=uuid.UUID(event["id"]),
        source="catalog",
        external_id=event["id"],
        title=event["title"],
        summary=event["summary"],
        category=event["category"],
        starts_at=datetime.fromisoformat(event["starts_at"]),
        ends_at=datetime.fromisoformat(event["ends_at"]),
        latitude=None if location is None else location["latitude"],
        longitude=None if location is None else location["longitude"],
        source_url=event["source_url"],
    )


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("TRUNCATE astronomical_events"))
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("TRUNCATE astronomical_events"))
        await engine.dispose()


@pytest.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        for name in ("launch", "lunar", "meteor_shower", "solar"):
            session.add(_row(_contract(name)))
        await session.commit()
    app: FastAPI = create_app()
    app.dependency_overrides[get_event_service] = lambda: EventService(
        SqlEventRepository(sessions), now=lambda: NOW
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    assert body["status"] == status
    assert body["code"] == code
    assert body["type"] and body["title"] and body["detail"]


async def test_tg351_active_events_match_the_spotwise_format(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/events/active", params={"date": "2026-11-24"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == [_contract("meteor_shower"), _contract("lunar")]


async def test_tg351_upcoming_events_match_the_spotwise_format(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/events/upcoming", params={"days": 30})

    assert response.status_code == 200
    assert response.json() == [
        _contract("launch"),
        _contract("meteor_shower"),
        _contract("lunar"),
    ]


async def test_tg351_optional_fields_are_sent_as_null_not_omitted(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/events/active", params={"date": "2026-11-24"})

    lunar = response.json()[1]
    assert "location" in lunar and lunar["location"] is None
    assert "source_url" in lunar and lunar["source_url"] is None


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/events/active", {"date": "2026-13-01"}),
        ("/api/events/active", {"date": "24-11-2026"}),
        ("/api/events/upcoming", {"days": 0}),
        ("/api/events/upcoming", {"days": 31}),
    ],
)
async def test_tg351_invalid_parameters_answer_422_problem_json(
    client: AsyncClient, path: str, params: dict[str, Any]
) -> None:
    response = await client.get(path, params=params)

    assert_problem(response, 422, "VALIDATION_ERROR")
