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


async def _seed(
    engine: AsyncEngine, user_id: uuid.UUID, count: int, last_activity: date
) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO daily_streaks (user_id, current_count, "
                "last_activity_date) VALUES (:u, :c, :d)"
            ),
            {"u": user_id, "c": count, "d": last_activity},
        )


async def test_first_activity_creates_a_streak_of_one(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    # TG-538 / US TG-56: persistir la ratxa
    streak = await repo.register_activity(user_id, lambda: DAY_1)

    assert streak.current_count == 1
    assert streak.last_activity_date == DAY_1
    assert await repo.get_by_user_id(user_id) == streak


async def test_get_by_user_id_returns_none_without_a_streak(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    assert await repo.get_by_user_id(user_id) is None


async def test_activity_on_the_next_day_extends_the_row_and_keeps_its_id(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    first = await repo.register_activity(user_id, lambda: DAY_1)

    second = await repo.register_activity(user_id, lambda: DAY_2)

    assert second.id == first.id
    assert second.current_count == 2
    assert await repo.get_by_user_id(user_id) == second
    assert await _count_rows(engine, user_id) == 1


async def test_activity_after_a_gap_restarts_the_streak(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    await _seed(engine, user_id, 5, DAY_1)

    streak = await repo.register_activity(user_id, lambda: DAY_3)

    assert streak.current_count == 1
    assert streak.last_activity_date == DAY_3
    assert await repo.get_by_user_id(user_id) == streak


async def test_a_second_activity_the_same_day_changes_nothing(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    first = await repo.register_activity(user_id, lambda: DAY_1)

    again = await repo.register_activity(user_id, lambda: DAY_1)

    assert again == first
    assert await repo.get_by_user_id(user_id) == first


async def test_an_earlier_day_changes_nothing(
    repo: SqlStreakRepository, user_id: uuid.UUID
) -> None:
    newer = await repo.register_activity(user_id, lambda: DAY_3)

    stored = await repo.register_activity(user_id, lambda: DAY_1)

    assert stored == newer
    assert await repo.get_by_user_id(user_id) == newer


async def test_concurrent_first_activities_leave_a_single_row_counted_once(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    # Dues peticions alhora no han de comptar dos cops.
    await asyncio.gather(
        repo.register_activity(user_id, lambda: DAY_1),
        repo.register_activity(user_id, lambda: DAY_1),
    )

    stored = await repo.get_by_user_id(user_id)
    assert stored is not None
    assert stored.current_count == 1
    assert stored.last_activity_date == DAY_1
    assert await _count_rows(engine, user_id) == 1


async def test_concurrent_activities_on_two_days_add_up(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    # Carrera a mitjanit UTC (review PR #88): ratxa 5 amb l'última activitat a
    # D-1; A (dia D) i B (dia D+1) arriben alhora. Siguin quin sigui l'ordre en
    # què agafen el pany, el resultat és 7 perquè el dia es llegeix ja amb la
    # fila bloquejada, i el rellotge només avança.
    await _seed(engine, user_id, 5, DAY_1)
    clock = iter([DAY_2, DAY_3])

    await asyncio.gather(
        repo.register_activity(user_id, lambda: next(clock)),
        repo.register_activity(user_id, lambda: next(clock)),
    )

    stored = await repo.get_by_user_id(user_id)
    assert stored is not None
    assert stored.current_count == 7
    assert stored.last_activity_date == DAY_3


async def test_the_day_is_read_only_after_the_row_is_locked(
    repo: SqlStreakRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    await _seed(engine, user_id, 5, DAY_1)
    reads: list[date] = []

    def today() -> date:
        reads.append(DAY_2)
        return DAY_2

    async with engine.connect() as holder:
        await holder.execute(
            text("SELECT 1 FROM daily_streaks WHERE user_id = :u FOR UPDATE"),
            {"u": user_id},
        )
        task = asyncio.create_task(repo.register_activity(user_id, today))
        await asyncio.sleep(0.3)
        assert reads == []
        await holder.commit()

    streak = await task
    assert reads == [DAY_2]
    assert streak.current_count == 6


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
