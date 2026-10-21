import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.application.users.errors import EMAIL_ALREADY_REGISTERED
from app.domain.shared.errors import ConflictError
from app.domain.users.models import User
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.repository import SqlUserRepository

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
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM user_identities"))
            await connection.execute(text("DELETE FROM users"))
        await engine.dispose()


@pytest.fixture
def repo(engine: AsyncEngine) -> SqlUserRepository:
    return SqlUserRepository(async_sessionmaker(engine, expire_on_commit=False))


def _new_user(sub: str | None = None, email: str | None = None) -> User:
    unique = uuid.uuid4().hex
    return User.create(
        google_sub=sub or f"sub-{unique}",
        email=email or f"{unique}@example.test",
        display_name="Ada",
        avatar_url="https://example.test/a.png",
    )


async def _count(engine: AsyncEngine, table: str) -> int:
    async with engine.connect() as connection:
        result = await connection.execute(text(f"SELECT count(*) FROM {table}"))
        return int(result.scalar_one())


async def test_add_then_get_by_google_sub_round_trips_the_account(
    repo: SqlUserRepository,
) -> None:
    # TG-137 / US #45 criteri 2
    user = _new_user()

    added = await repo.add(user)
    found = await repo.get_by_google_sub(user.google_sub)

    assert added == user
    assert found == user


async def test_get_by_google_sub_returns_none_for_an_unknown_sub(
    repo: SqlUserRepository,
) -> None:
    assert await repo.get_by_google_sub("unknown") is None


async def test_save_last_login_persists_the_new_timestamp(
    repo: SqlUserRepository,
) -> None:
    # TG-137 / US #45 criteri 3
    user = await repo.add(_new_user())
    later = user.last_login_at.replace(year=user.last_login_at.year + 1)

    await repo.save_last_login(user.record_login(later))

    stored = await repo.get_by_google_sub(user.google_sub)
    assert stored is not None
    assert stored.last_login_at == later


async def test_add_of_a_registered_sub_returns_the_existing_account(
    repo: SqlUserRepository, engine: AsyncEngine
) -> None:
    first = await repo.add(_new_user(sub="sub-same", email="one@example.test"))

    # Same sub, new email (the Google email changed): no orphan user is left.
    second = await repo.add(_new_user(sub="sub-same", email="two@example.test"))

    assert second.id == first.id
    assert await _count(engine, "users") == 1
    assert await _count(engine, "user_identities") == 1


async def test_add_with_the_email_of_another_sub_is_a_conflict(
    repo: SqlUserRepository, engine: AsyncEngine
) -> None:
    # TG-137 / US #45 criteri 3: cap duplicat per email
    await repo.add(_new_user(sub="sub-a", email="same@example.test"))

    with pytest.raises(ConflictError) as exc_info:
        await repo.add(_new_user(sub="sub-b", email="same@example.test"))

    assert exc_info.value.code == EMAIL_ALREADY_REGISTERED
    assert await _count(engine, "users") == 1


async def test_concurrent_first_accesses_leave_a_single_account(
    repo: SqlUserRepository, engine: AsyncEngine
) -> None:
    # TG-137 / US #45 criteri 4
    candidates = [
        _new_user(sub="sub-race", email="race@example.test") for _ in range(8)
    ]

    results = await asyncio.gather(*(repo.add(user) for user in candidates))

    assert len({user.id for user in results}) == 1
    assert await _count(engine, "users") == 1
    assert await _count(engine, "user_identities") == 1
