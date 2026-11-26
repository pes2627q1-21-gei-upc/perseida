"""load_zones against PostgreSQL/PostGIS for real (TG-70, criteri 5).

Every test runs in a transaction that is rolled back.
"""

import os
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from alembic import command
from app.domain.observation_zones.models import ObservationZone
from app.domain.shared.location import Location
from app.infrastructure.observation_zones.load_zones import load_zones
from app.infrastructure.persistence.config import DatabaseSettings

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def connection() -> AsyncIterator[AsyncConnection]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(text("DELETE FROM observation_zones"))
                yield connection
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


def _zone(zone_id: uuid.UUID, name: str, latitude: float) -> ObservationZone:
    return ObservationZone(
        id=zone_id,
        name=name,
        location=Location(latitude=latitude, longitude=1.0),
    )


async def _rows(connection: AsyncConnection) -> list[tuple[uuid.UUID, str, float]]:
    result = await connection.execute(
        text("SELECT id, name, latitude FROM observation_zones ORDER BY name")
    )
    return [(row.id, row.name, row.latitude) for row in result]


async def test_tg70_c5_the_zones_are_stored(connection: AsyncConnection) -> None:
    a, b = uuid.uuid7(), uuid.uuid7()

    await load_zones(connection, [_zone(a, "A", 41.0), _zone(b, "B", 42.0)])

    assert await _rows(connection) == [(a, "A", 41.0), (b, "B", 42.0)]


async def test_tg70_c5_loading_twice_does_not_duplicate(
    connection: AsyncConnection,
) -> None:
    zones = [_zone(uuid.uuid7(), "A", 41.0), _zone(uuid.uuid7(), "B", 42.0)]

    await load_zones(connection, zones)
    await load_zones(connection, zones)

    assert len(await _rows(connection)) == 2


async def test_tg70_c5_a_zone_with_the_same_id_is_updated(
    connection: AsyncConnection,
) -> None:
    zone_id = uuid.uuid7()
    await load_zones(connection, [_zone(zone_id, "Old", 41.0)])

    await load_zones(connection, [_zone(zone_id, "New", 42.0)])

    assert await _rows(connection) == [(zone_id, "New", 42.0)]


async def test_tg70_c5_a_zone_missing_from_the_file_is_kept(
    connection: AsyncConnection,
) -> None:
    kept = _zone(uuid.uuid7(), "Kept", 41.0)
    await load_zones(connection, [kept])

    await load_zones(connection, [_zone(uuid.uuid7(), "Other", 42.0)])

    assert {name for _, name, _ in await _rows(connection)} == {"Kept", "Other"}
