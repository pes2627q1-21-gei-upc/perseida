import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.domain.streaks.models import DailyStreak
from app.domain.users.models import User
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.streaks.repository import SqlStreakRepository
from app.infrastructure.users.repository import SqlUserRepository

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

DAY_1 = date(2026, 3, 10)
DAY_2 = date(2026, 3, 11)
DAY_3 = date(2026, 3, 12)


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
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM daily_streaks"))
            await connection.execute(text("DELETE FROM user_identities"))
            await connection.execute(text("DELETE FROM users"))
        await engine.dispose()


@pytest.fixture
def repo(engine: AsyncEngine) -> SqlStreakRepository:
    return SqlStreakRepository(async_sessionmaker(engine, expire_on_commit=False))


@pytest.fixture
async def user_id(engine: AsyncEngine) -> uuid.UUID:
    unique = uuid.uuid4().hex
    users = SqlUserRepository(async_sessionmaker(engine, expire_on_commit=False))
    user = await users.add(
        User.create(
            google_sub=f"sub-{unique}",
            email=f"{unique}@example.test",
            display_name="Ada",
            avatar_url="https://example.test/a.png",
        )
    )
    return user.id


async def _count_rows(engine: AsyncEngine, user_id: uuid.UUID) -> int:
    async with engine.connect() as connection:
        result = await connection.execute(
            text("SELECT count(*) FROM daily_streaks WHERE user_id = :u"),
            {"u": user_id},
        )
        return int(result.scalar_one())


async def test_save_then_get_round_trips_a_new_streak(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    # TG-538 / US TG-56: persistir la ratxa
    streak = DailyStreak.start(user_id, DAY_1)

    await repo.save(streak)

    assert await repo.get_by_user_id(user_id) == streak


async def test_get_by_user_id_returns_none_without_a_streak(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    assert await repo.get_by_user_id(user_id) is None


async def test_save_with_a_later_date_updates_the_row_and_keeps_its_id(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    first = DailyStreak.start(user_id, DAY_1)
    await repo.save(first)

    await repo.save(first.register_activity(DAY_2))

    stored = await repo.get_by_user_id(user_id)
    assert stored is not None
    assert stored.id == first.id
    assert stored.current_count == 2
    assert stored.last_activity_date == DAY_2
    assert await _count_rows(engine, user_id) == 1


async def test_save_with_the_same_date_changes_nothing(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    first = DailyStreak.start(user_id, DAY_1)
    await repo.save(first)

    await repo.save(first.model_copy(update={"current_count": 5}))

    assert await repo.get_by_user_id(user_id) == first


async def test_save_with_an_earlier_date_changes_nothing(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    newer = DailyStreak.start(user_id, DAY_3)
    await repo.save(newer)

    await repo.save(
        newer.model_copy(update={"current_count": 7, "last_activity_date": DAY_1})
    )

    assert await repo.get_by_user_id(user_id) == newer


async def test_concurrent_saves_of_the_same_new_streak_leave_a_single_row(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    # Dues peticions alhora no han de comptar dos cops.
    first = DailyStreak.start(user_id, DAY_1)
    second = DailyStreak.start(user_id, DAY_1)

    await asyncio.gather(repo.save(first), repo.save(second))

    stored = await repo.get_by_user_id(user_id)
    assert stored is not None
    assert stored.current_count == 1
    assert stored.last_activity_date == DAY_1
    assert await _count_rows(engine, user_id) == 1


async def test_database_rejects_a_zero_count(
    engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO daily_streaks (user_id, current_count, "
                    "last_activity_date) VALUES (:u, 0, :d)"
                ),
                {"u": user_id, "d": DAY_1},
            )


async def test_database_rejects_an_unknown_user(engine: AsyncEngine) -> None:
    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO daily_streaks (user_id, current_count, "
                    "last_activity_date) VALUES (:u, 1, :d)"
                ),
                {"u": uuid.uuid4(), "d": DAY_1},
            )
