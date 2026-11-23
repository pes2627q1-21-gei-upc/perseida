"""Each pytest-xdist worker uses its own migrated database and Redis index
(TG-362, US #362, criteri 2: ``pytest -n auto`` without collisions).

The test conftest points ``POSTGRES_DB`` and ``REDIS_DB`` at the worker before
any settings are built, creates the worker database and runs ``alembic upgrade
head`` on it. ``worker_id`` is the pytest-xdist fixture (``master`` without -n).
"""

import os
import re

import pytest
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.persistence.config import DatabaseSettings
from tests.integration.workers import worker_database_name, worker_redis_db

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="Worker isolation test requires POSTGRES_HOST and REDIS_HOST",
)


def test_tg362_settings_point_at_the_worker_database(worker_id: str) -> None:
    database = DatabaseSettings().postgres_db

    if worker_id == "master":
        assert not re.search(r"_gw\d+$", database), database
    else:
        base = database.removesuffix(f"_{worker_id}")
        assert base != database, f"{database} is not the database of {worker_id}"
        assert database == worker_database_name(base, worker_id)


async def test_tg362_worker_database_exists_and_is_migrated(worker_id: str) -> None:
    settings = DatabaseSettings()
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as connection:
            current = await connection.scalar(text("SELECT current_database()"))
            alembic_version = await connection.scalar(
                text("SELECT to_regclass('public.alembic_version')")
            )
    finally:
        await engine.dispose()

    assert current == settings.postgres_db
    assert alembic_version is not None, f"{current} has no alembic_version table"


async def test_tg362_settings_point_at_the_worker_redis_index(worker_id: str) -> None:
    settings = RedisSettings()
    expected = worker_redis_db(worker_id)

    assert settings.redis_db == expected
    client = Redis.from_url(settings.redis_url)
    try:
        assert client.connection_pool.connection_kwargs["db"] == expected
        assert await client.ping()
    finally:
        await client.aclose()
