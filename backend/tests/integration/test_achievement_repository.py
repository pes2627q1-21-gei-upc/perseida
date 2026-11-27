"""``SqlAchievementRepository`` on PostgreSQL (TG-58 / task TG-572)."""

import asyncio
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.application.achievements.achievement_service import AchievementService
from app.domain.achievements.models import Achievement
from app.domain.users.models import User
from app.infrastructure.achievements.repository import SqlAchievementRepository
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.repository import SqlUserRepository
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

PREFIX = "achievement-repo"
# Only the rows of this module's users: never the catalog or other data.
DELETE_OWN_ROWS = (
    text(
        "DELETE FROM user_achievements WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM user_identities WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text("DELETE FROM users WHERE email LIKE :prefix"),
)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


async def _read_achievement_counts() -> tuple[int, int]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            catalog = await connection.scalar(text("SELECT count(*) FROM achievements"))
            unlocked = await connection.scalar(
                text("SELECT count(*) FROM user_achievements")
            )
            return int(catalog or 0), int(unlocked or 0)
    finally:
        await engine.dispose()


def _achievement_counts() -> tuple[int, int]:
    # Kept here (not in isolation.py) so the other modules do not depend on the
    # achievements tables.
    return asyncio.run(_read_achievement_counts())


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    before = (row_counts(), _achievement_counts())
    yield
    assert (row_counts(), _achievement_counts()) == before


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            for statement in DELETE_OWN_ROWS:
                await connection.execute(statement, {"prefix": f"{PREFIX}-%"})
        await engine.dispose()


@pytest.fixture
def repo(engine: AsyncEngine) -> SqlAchievementRepository:
    return SqlAchievementRepository(async_sessionmaker(engine, expire_on_commit=False))


async def _new_user(engine: AsyncEngine) -> uuid.UUID:
    unique = f"{PREFIX}-{uuid.uuid4().hex}"
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


@pytest.fixture
async def user_id(engine: AsyncEngine) -> uuid.UUID:
    return await _new_user(engine)


def _by_code(catalog: list[Achievement], code: str) -> Achievement:
    return next(a for a in catalog if a.code == code)


async def _count_rows(
    engine: AsyncEngine, user_id: uuid.UUID, achievement_id: uuid.UUID
) -> int:
    async with engine.connect() as connection:
        result = await connection.execute(
            text(
                "SELECT count(*) FROM user_achievements"
                " WHERE user_id = :u AND achievement_id = :a"
            ),
            {"u": user_id, "a": achievement_id},
        )
        return int(result.scalar_one())


async def test_tg572_list_catalog_returns_the_34_achievements(
    repo: SqlAchievementRepository,
) -> None:
    catalog = await repo.list_catalog()

    assert len(catalog) == 34
    assert all(isinstance(item, Achievement) for item in catalog)
    assert len({item.code for item in catalog}) == 34
    perseida = _by_code(catalog, "perseida")
    assert perseida.kind == "streak_days"
    assert perseida.threshold == 365
    assert perseida.category == "streaks"


async def test_tg572_unlock_stores_the_achievement_with_a_utc_moment(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    catalog = await repo.list_catalog()
    first = _by_code(catalog, "primera_llum")
    before = datetime.now(UTC) - timedelta(seconds=5)

    unlocked = await repo.unlock(user_id, {first.id})

    assert len(unlocked) == 1
    assert unlocked[0].user_id == user_id
    assert unlocked[0].achievement_id == first.id
    assert unlocked[0].unlocked_at.utcoffset() == timedelta(0)
    assert before <= unlocked[0].unlocked_at <= datetime.now(UTC) + timedelta(seconds=5)
    assert await repo.list_unlocked_ids(user_id) == {first.id}
    assert await _count_rows(engine, user_id, first.id) == 1


async def test_tg572_unlock_several_achievements_at_once(
    repo: SqlAchievementRepository, user_id: uuid.UUID
) -> None:
    catalog = await repo.list_catalog()
    ids = {
        _by_code(catalog, "primera_llum").id,
        _by_code(catalog, "orbita_setmanal").id,
    }

    unlocked = await repo.unlock(user_id, ids)

    assert {item.achievement_id for item in unlocked} == ids
    assert await repo.list_unlocked_ids(user_id) == ids


async def test_tg572_unlock_with_no_ids_does_nothing(
    repo: SqlAchievementRepository, user_id: uuid.UUID
) -> None:
    assert await repo.unlock(user_id, set()) == []
    assert await repo.list_unlocked_ids(user_id) == set()


async def test_tg572_unlocking_again_neither_duplicates_nor_fails(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    catalog = await repo.list_catalog()
    first = _by_code(catalog, "primera_llum")
    second = _by_code(catalog, "orbita_setmanal")
    original = await repo.unlock(user_id, {first.id})

    again = await repo.unlock(user_id, {first.id})
    mixed = await repo.unlock(user_id, {first.id, second.id})

    assert again == []
    # Only the new one is reported; the first keeps its original moment.
    assert [item.achievement_id for item in mixed] == [second.id]
    assert await _count_rows(engine, user_id, first.id) == 1
    async with engine.connect() as connection:
        moment = (
            await connection.execute(
                text(
                    "SELECT unlocked_at FROM user_achievements"
                    " WHERE user_id = :u AND achievement_id = :a"
                ),
                {"u": user_id, "a": first.id},
            )
        ).scalar_one()
    assert moment == original[0].unlocked_at


async def test_tg572_list_unlocked_ids_only_returns_the_users_own(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    catalog = await repo.list_catalog()
    first = _by_code(catalog, "primera_llum")
    second = _by_code(catalog, "telescopi_nou")
    other = await _new_user(engine)
    await repo.unlock(user_id, {first.id})
    await repo.unlock(other, {second.id})

    assert await repo.list_unlocked_ids(user_id) == {first.id}
    assert await repo.list_unlocked_ids(other) == {second.id}
    assert await repo.list_unlocked_ids(uuid.uuid4()) == set()


async def test_tg572_two_users_can_unlock_the_same_achievement(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    first = _by_code(await repo.list_catalog(), "primera_llum")
    other = await _new_user(engine)

    mine = await repo.unlock(user_id, {first.id})
    theirs = await repo.unlock(other, {first.id})

    assert len(mine) == 1
    assert len(theirs) == 1
    assert mine[0].id != theirs[0].id
    assert await repo.list_unlocked_ids(user_id) == {first.id}
    assert await repo.list_unlocked_ids(other) == {first.id}


async def test_tg572_concurrent_unlocks_leave_one_row_and_report_it_once(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    first = _by_code(await repo.list_catalog(), "primera_llum")

    results = await asyncio.gather(
        repo.unlock(user_id, {first.id}),
        repo.unlock(user_id, {first.id}),
    )

    assert sorted(len(result) for result in results) == [0, 1]
    assert await _count_rows(engine, user_id, first.id) == 1


async def _no_streak(user_id: uuid.UUID) -> int:
    return 0


def _reached_by_a_streak_of_7(achievement: Achievement) -> bool:
    return achievement.kind.value == "streak_days" and achievement.threshold <= 7


async def test_tg575_concurrent_record_activity_unlocks_each_achievement_once(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    # TG-575 / US TG-58 criteri 3: dues peticions alhora a nivell de servei
    # (cadascuna llegeix "cap desbloquejada" i totes intenten desbloquejar).
    service = AchievementService(repo, _no_streak)
    catalog = await repo.list_catalog()
    first = _by_code(catalog, "primera_llum")
    weekly = _by_code(catalog, "orbita_setmanal")

    results = await asyncio.gather(
        *(service.record_activity(user_id, "streak_days", 7) for _ in range(4))
    )

    reported = [item.achievement_id for result in results for item in result]
    # Each reached achievement is reported by exactly one of the calls.
    expected = [a.id for a in catalog if _reached_by_a_streak_of_7(a)]
    assert sorted(reported) == sorted(expected)
    assert {first.id, weekly.id} <= set(reported)
    assert await _count_rows(engine, user_id, first.id) == 1
    assert await _count_rows(engine, user_id, weekly.id) == 1


# TG-574 (US TG-58 criteri 7): les desbloquejades amb la seva data
async def test_tg574_list_unlocked_at_returns_each_unlock_moment_in_utc(
    repo: SqlAchievementRepository, user_id: uuid.UUID
) -> None:
    catalog = await repo.list_catalog()
    first = _by_code(catalog, "primera_llum")
    second = _by_code(catalog, "orbita_setmanal")
    unlocked = await repo.unlock(user_id, {first.id, second.id})

    moments = await repo.list_unlocked_at(user_id)

    assert moments == {item.achievement_id: item.unlocked_at for item in unlocked}
    assert all(moment.utcoffset() == timedelta(0) for moment in moments.values())


async def test_tg574_list_unlocked_at_only_returns_the_users_own(
    repo: SqlAchievementRepository, engine: AsyncEngine, user_id: uuid.UUID
) -> None:
    catalog = await repo.list_catalog()
    first = _by_code(catalog, "primera_llum")
    second = _by_code(catalog, "orbita_setmanal")
    other = await _new_user(engine)
    await repo.unlock(user_id, {first.id})
    await repo.unlock(other, {second.id})

    assert set(await repo.list_unlocked_at(user_id)) == {first.id}
    assert set(await repo.list_unlocked_at(other)) == {second.id}
    assert await repo.list_unlocked_at(uuid.uuid4()) == {}
