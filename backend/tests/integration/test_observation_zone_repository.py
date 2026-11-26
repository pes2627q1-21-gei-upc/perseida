"""SqlObservationZoneRepository against PostgreSQL/PostGIS for real (TG-70,
criteris 2, 3 i 6).

Distances are measured by PostGIS on ``geography``; the points are far from the
edge of each radius, except in the test of the edge itself, which measures the
distance first and searches one metre beyond and short of it. Every test runs
in a transaction that is rolled back.
"""

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.domain.observation_zones.models import ObservationZone, ZoneProximity
from app.infrastructure.observation_zones.repository import (
    SqlObservationZoneRepository,
    find_within_statement,
)
from app.infrastructure.persistence.config import DatabaseSettings
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

SPATIAL_INDEX = "ix_observation_zones_location"
# Barcelona, the centre of every search.
BARCELONA = {"latitude": 41.3874, "longitude": 2.1686}
# Great-circle distances from Barcelona: Montserrat ~38 km, Montsec ~150 km,
# Madrid ~505 km.
MONTSERRAT = {"latitude": 41.5934, "longitude": 1.8378}
MONTSEC = {"latitude": 42.0517, "longitude": 0.7296}
MADRID = {"latitude": 40.4168, "longitude": -3.7038}


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def connection() -> AsyncIterator[AsyncConnection]:
    """One connection inside a transaction that is rolled back after the test.

    The table starts empty inside it, so a seed of other migrations does not
    change what a search finds.
    """
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


@pytest.fixture
def repo(connection: AsyncConnection) -> SqlObservationZoneRepository:
    factory = async_sessionmaker(
        bind=connection,
        class_=AsyncSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    return SqlObservationZoneRepository(factory)


def _zone(name: str, place: dict[str, float]) -> ObservationZone:
    return ObservationZone.create(name=name, **place)


def _near_barcelona(radius_km: float) -> ZoneProximity:
    return ZoneProximity.create(**BARCELONA, radius_km=radius_km)


async def test_tg70_c3_c6_returns_the_zones_within_the_radius_nearest_first(
    repo: SqlObservationZoneRepository,
) -> None:
    montsec = _zone("Montsec", MONTSEC)
    montserrat = _zone("Montserrat", MONTSERRAT)
    madrid = _zone("Madrid", MADRID)
    for zone in (montsec, madrid, montserrat):
        await repo.save(zone)

    found = await repo.find_within(_near_barcelona(300))

    assert [hit.zone for hit in found] == [montserrat, montsec]
    assert found[0].distance_km == pytest.approx(38, abs=3)
    assert found[1].distance_km == pytest.approx(150, abs=10)


async def test_tg70_c6_a_zone_out_of_the_radius_is_not_returned(
    repo: SqlObservationZoneRepository,
) -> None:
    await repo.save(_zone("Montsec", MONTSEC))

    assert await repo.find_within(_near_barcelona(100)) == []


async def test_tg70_c6_a_search_without_zones_returns_nothing(
    repo: SqlObservationZoneRepository,
) -> None:
    assert await repo.find_within(_near_barcelona(20_000)) == []


async def test_tg70_c3_a_zone_at_the_point_is_at_distance_zero(
    repo: SqlObservationZoneRepository,
) -> None:
    here = _zone("Barcelona", BARCELONA)
    await repo.save(here)

    [hit] = await repo.find_within(_near_barcelona(1))

    assert hit.zone == here
    assert hit.distance_km == pytest.approx(0, abs=1e-6)


async def test_tg70_c6_a_zone_just_at_the_edge_of_the_radius_is_returned(
    repo: SqlObservationZoneRepository,
) -> None:
    montsec = _zone("Montsec", MONTSEC)
    await repo.save(montsec)
    [measured] = await repo.find_within(_near_barcelona(300))
    one_metre = 0.001

    [hit] = await repo.find_within(_near_barcelona(measured.distance_km + one_metre))

    assert hit.zone == montsec
    assert (
        await repo.find_within(_near_barcelona(measured.distance_km - one_metre)) == []
    )


async def test_tg70_c3_zones_at_the_same_distance_are_sorted_by_id(
    repo: SqlObservationZoneRepository,
) -> None:
    first = _zone("Montsec A", MONTSEC)
    second = _zone("Montsec B", MONTSEC)
    await repo.save(second)
    await repo.save(first)

    found = await repo.find_within(_near_barcelona(300))

    assert [hit.zone for hit in found] == sorted(
        [first, second], key=lambda zone: zone.id
    )


async def test_tg70_c2_the_search_filters_by_the_spatial_index(
    connection: AsyncConnection,
) -> None:
    statement = find_within_statement(_near_barcelona(300)).compile(
        dialect=connection.dialect, compile_kwargs={"literal_binds": True}
    )
    await connection.execute(text("SET LOCAL enable_seqscan = off"))
    plan = [
        line for (line,) in await connection.exec_driver_sql(f"EXPLAIN {statement}")
    ]

    assert any(
        SPATIAL_INDEX in line and following.strip().startswith("Index Cond:")
        for line, following in zip(plan, plan[1:], strict=False)
    ), "\n".join(plan)
