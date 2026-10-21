import os
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.infrastructure.apod.repository import SqlApodRepository
from app.infrastructure.persistence.config import DatabaseSettings
from tests.factories.apod import make_apod

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)


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
            await session.execute(text("TRUNCATE apod"))
            await session.commit()
        yield factory
    finally:
        await engine.dispose()


async def test_tg46_c4_saved_apod_is_read_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    repository = SqlApodRepository(session_factory)
    apod = make_apod(date(2026, 10, 14), copyright="Jane Doe")

    await repository.save(apod)

    assert await repository.get(date(2026, 10, 14)) == apod
    assert await repository.get(date(2026, 10, 15)) is None


async def test_tg46_c4_one_row_per_date_and_the_first_one_stays(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    repository = SqlApodRepository(session_factory)
    first = make_apod(date(2026, 10, 14))

    await repository.save(first)
    await repository.save(first.model_copy(update={"title": "Another title"}))

    assert await repository.get(date(2026, 10, 14)) == first
    async with session_factory() as session:
        assert await session.scalar(text("SELECT count(*) FROM apod")) == 1


async def test_tg46_c4_apod_date_has_the_named_unique_constraint(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        constraint = await session.scalar(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'apod'::regclass AND contype = 'u'"
            )
        )

    assert constraint == "uq_apod_apod_date"


async def test_tg46_c6_latest_is_the_most_recent_up_to_a_date(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    repository = SqlApodRepository(session_factory)
    for day in (date(2026, 10, 1), date(2026, 10, 14), date(2026, 10, 20)):
        await repository.save(make_apod(day))

    latest = await repository.latest(until=date(2026, 10, 15))

    assert latest is not None
    assert latest.apod_date == date(2026, 10, 14)
    assert await repository.latest(until=date(2026, 9, 1)) is None
