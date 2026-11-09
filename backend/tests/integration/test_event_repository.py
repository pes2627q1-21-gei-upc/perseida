import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.domain.events.models import AstronomicalEvent, Location
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.events.tables import AstronomicalEventRow
from app.infrastructure.persistence.config import DatabaseSettings
from tests.factories.events import make_event

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

DAY = datetime(2026, 11, 17, tzinfo=UTC)
NEXT_DAY = DAY + timedelta(days=1)


@pytest.fixture(scope="module")
def _migrated() -> None:
    # Sync on purpose: env.py runs the migrations with asyncio.run.
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def session_factory(
    _migrated: None,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(DatabaseSettings().database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            await session.execute(text("TRUNCATE astronomical_events"))
            await session.commit()
        yield factory
    finally:
        await engine.dispose()


async def _store(
    session_factory: async_sessionmaker[AsyncSession], *events: AstronomicalEvent
) -> None:
    async with session_factory() as session:
        for event in events:
            location = event.location
            session.add(
                AstronomicalEventRow(
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
            )
        await session.commit()


async def test_tg351_list_between_returns_overlapping_events_by_start(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    ended_before = make_event(DAY - timedelta(hours=20), DAY - timedelta(hours=12))
    spanning = make_event(DAY - timedelta(hours=18), NEXT_DAY + timedelta(hours=6))
    ending_at_midnight = make_event(DAY - timedelta(hours=14), DAY)
    instant_at_midnight = make_event(DAY)
    inside = make_event(DAY + timedelta(hours=20), DAY + timedelta(hours=22))
    starting_next_day = make_event(NEXT_DAY)
    await _store(
        session_factory,
        starting_next_day,
        inside,
        instant_at_midnight,
        ending_at_midnight,
        spanning,
        ended_before,
    )

    events = await SqlEventRepository(session_factory).list_between(DAY, NEXT_DAY)

    assert events == [spanning, ending_at_midnight, instant_at_midnight, inside]


async def test_tg351_list_starting_between_skips_events_already_started(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    now = DAY + timedelta(hours=12)
    end = now + timedelta(days=7)
    already_started = make_event(now - timedelta(hours=2), now + timedelta(hours=2))
    starting_now = make_event(now)
    later = make_event(now + timedelta(days=3))
    starting_at_end = make_event(end)
    await _store(session_factory, starting_at_end, later, starting_now, already_started)

    events = await SqlEventRepository(session_factory).list_starting_between(now, end)

    assert events == [starting_now, later]


async def test_tg351_location_is_read_back_and_may_be_null(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    located = make_event(DAY, location=Location(latitude=28.5618, longitude=-80.577))
    everywhere = make_event(DAY + timedelta(hours=1))
    await _store(session_factory, located, everywhere)

    events = await SqlEventRepository(session_factory).list_between(DAY, NEXT_DAY)

    assert events == [located, everywhere]
