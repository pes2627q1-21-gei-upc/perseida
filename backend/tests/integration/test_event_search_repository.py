"""SqlEventRepository.search against PostgreSQL/PostGIS for real (TG-51, criteris
3, 4, 5 i 10).

Proximity is measured by PostGIS (``ST_DWithin`` on ``geography``), so the
points are far from the edge of each radius.
"""

import os
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.domain.events.models import (
    AstronomicalEvent,
    EventCategory,
    EventQuery,
    Location,
)
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.events.tables import AstronomicalEventRow
from app.infrastructure.persistence.config import DatabaseSettings
from tests.factories.events import make_event

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

TODAY = date(2026, 11, 17)
DAY = datetime(2026, 11, 17, tzinfo=UTC)
NEXT_DAY = DAY + timedelta(days=1)
BARCELONA = Location(latitude=41.3874, longitude=2.1686)
# About 505 km from Barcelona (great circle).
MADRID = Location(latitude=40.4168, longitude=-3.7038)
GIRONA = Location(latitude=41.9794, longitude=2.8214)
SPATIAL_INDEX = "ix_astronomical_events_location"


def search_query(
    from_day: date = TODAY,
    to_day: date = TODAY,
    categories: tuple[EventCategory, ...] = (),
    near: Location | None = None,
    radius_km: float | None = None,
) -> EventQuery:
    return EventQuery.from_filters(
        today=TODAY,
        from_day=from_day,
        to_day=to_day,
        categories=list(categories),
        lat=None if near is None else near.latitude,
        lon=None if near is None else near.longitude,
        radius_km=radius_km,
    )


@pytest.fixture(scope="module")
def _migrated() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def engine(_migrated: None) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("TRUNCATE astronomical_events CASCADE"))
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("TRUNCATE astronomical_events CASCADE"))
        await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def repository(
    session_factory: async_sessionmaker[AsyncSession],
) -> SqlEventRepository:
    return SqlEventRepository(session_factory)


def _row(event: AstronomicalEvent) -> AstronomicalEventRow:
    location = event.location
    return AstronomicalEventRow(
        id=event.id,
        source="catalog",
        external_id=str(event.id),
        title=event.title,
        summary=event.summary,
        category=event.category.value,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        latitude=None if location is None else location.latitude,
        longitude=None if location is None else location.longitude,
        source_url=event.source_url,
    )


async def _store(
    session_factory: async_sessionmaker[AsyncSession], *events: AstronomicalEvent
) -> None:
    async with session_factory() as session:
        session.add_all([_row(event) for event in events])
        await session.commit()


async def test_tg51_c3_search_returns_the_events_overlapping_the_range(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
) -> None:
    ended_before = make_event(DAY - timedelta(hours=20), DAY - timedelta(hours=12))
    started_before_ends_inside = make_event(
        DAY - timedelta(hours=18), DAY + timedelta(hours=6)
    )
    ending_at_midnight = make_event(DAY - timedelta(hours=14), DAY)
    instant_at_start = make_event(DAY)
    spanning = make_event(DAY - timedelta(days=2), NEXT_DAY + timedelta(days=2))
    last_minute = make_event(NEXT_DAY - timedelta(minutes=1))
    instant_at_end = make_event(NEXT_DAY)
    await _store(
        session_factory,
        instant_at_end,
        last_minute,
        spanning,
        instant_at_start,
        ending_at_midnight,
        started_before_ends_inside,
        ended_before,
    )

    events = await repository.search(search_query())

    assert events == [
        spanning,
        started_before_ends_inside,
        ending_at_midnight,
        instant_at_start,
        last_minute,
    ]


async def test_tg51_c1_search_sorts_by_start_and_then_by_id(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
) -> None:
    at_noon = DAY + timedelta(hours=12)
    tied = sorted((make_event(at_noon) for _ in range(3)), key=lambda event: event.id)
    earlier = make_event(DAY + timedelta(hours=1))
    # Stored in reverse, so the order cannot come from insertion.
    await _store(session_factory, *reversed(tied), earlier)

    events = await repository.search(search_query())

    assert events == [earlier, *tied]


async def test_tg51_c1_search_filters_by_one_or_several_categories(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
) -> None:
    lunar = make_event(DAY + timedelta(hours=1), category=EventCategory.LUNAR)
    launch = make_event(DAY + timedelta(hours=2), category=EventCategory.LAUNCH)
    solar = make_event(DAY + timedelta(hours=3), category=EventCategory.SOLAR)
    await _store(session_factory, lunar, launch, solar)

    assert await repository.search(
        search_query(categories=(EventCategory.LAUNCH,))
    ) == [launch]
    assert await repository.search(
        search_query(categories=(EventCategory.LUNAR, EventCategory.SOLAR))
    ) == [lunar, solar]
    assert await repository.search(search_query()) == [lunar, launch, solar]


@pytest.mark.parametrize(
    ("radius_km", "expected"),
    [(100, ["girona", "everywhere"]), (600, ["madrid", "girona", "everywhere"])],
    ids=["100-km", "600-km"],
)
async def test_tg51_c4_near_keeps_events_in_the_radius_and_without_location(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
    radius_km: float,
    expected: list[str],
) -> None:
    events = {
        "madrid": make_event(DAY + timedelta(hours=1), location=MADRID),
        "girona": make_event(DAY + timedelta(hours=2), location=GIRONA),
        "everywhere": make_event(DAY + timedelta(hours=3)),
    }
    await _store(session_factory, *events.values())

    found = await repository.search(search_query(near=BARCELONA, radius_km=radius_km))

    assert found == [events[name] for name in expected]


async def test_tg51_c4_near_combines_with_dates_and_categories(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
) -> None:
    wanted = make_event(DAY + timedelta(hours=1), location=GIRONA)
    everywhere = make_event(DAY + timedelta(hours=2))
    other_category = make_event(
        DAY + timedelta(hours=3), location=GIRONA, category=EventCategory.LAUNCH
    )
    everywhere_other_category = make_event(
        DAY + timedelta(hours=4), category=EventCategory.LAUNCH
    )
    other_day = make_event(NEXT_DAY + timedelta(hours=1), location=GIRONA)
    everywhere_other_day = make_event(NEXT_DAY + timedelta(hours=2))
    far = make_event(DAY + timedelta(hours=5), location=MADRID)
    await _store(
        session_factory,
        wanted,
        everywhere,
        other_category,
        everywhere_other_category,
        other_day,
        everywhere_other_day,
        far,
    )

    found = await repository.search(
        search_query(categories=(EventCategory.LUNAR,), near=BARCELONA, radius_km=100)
    )

    assert found == [wanted, everywhere]


async def test_tg51_c4_near_sorts_located_and_unlocated_events_together(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
) -> None:
    first = make_event(DAY + timedelta(hours=1))
    second = make_event(DAY + timedelta(hours=2), location=GIRONA)
    third = make_event(DAY + timedelta(hours=3))
    await _store(session_factory, third, second, first)

    found = await repository.search(search_query(near=BARCELONA, radius_km=100))

    assert found == [first, second, third]


async def test_tg51_c4_near_returns_each_event_once(
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
) -> None:
    located = make_event(DAY + timedelta(hours=1), location=BARCELONA)
    await _store(session_factory, located)

    found = await repository.search(search_query(near=BARCELONA, radius_km=20_000))

    assert found == [located]


async def test_tg51_c5_the_proximity_query_uses_the_spatial_index(
    engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    repository: SqlEventRepository,
    captured_sql: list[tuple[str, Any]],
) -> None:
    # Many located events on the same day, spread over the world: only the
    # spatial index narrows them down.
    spread = [
        make_event(
            DAY + timedelta(minutes=i % 1440),
            location=Location(latitude=(i % 170) - 85, longitude=(i * 7 % 360) - 180),
        )
        for i in range(2000)
    ]
    await _store(session_factory, *spread)
    async with engine.begin() as connection:
        await connection.execute(text("ANALYZE astronomical_events"))
    captured_sql.clear()

    await repository.search(search_query(near=BARCELONA, radius_km=100))

    [(statement, parameters)] = [
        (sql, params) for sql, params in captured_sql if "astronomical_events" in sql
    ]
    async with engine.begin() as connection:
        await connection.execute(text("SET LOCAL enable_seqscan = off"))
        plan = await connection.exec_driver_sql(f"EXPLAIN {statement}", parameters)
        lines = [line for (line,) in plan]
    # The index must filter by distance (``Index Cond``), not only be walked for
    # its ``latitude IS NOT NULL`` rows with the distance left to a ``Filter``.
    assert _index_filters_by_distance(lines), "\n".join(lines)


def _index_filters_by_distance(plan: list[str]) -> bool:
    return any(
        SPATIAL_INDEX in line
        and following.strip().startswith("Index Cond:")
        and "geography" in following
        for line, following in zip(plan, plan[1:], strict=False)
    )
