"""Per-worker resources of the integration tests (TG-362).

The database of this pytest-xdist worker is created and migrated once, and the
``redis`` fixture gives each test the worker's own Redis database.

Only the integration tests need a database: the unit tests (and mutmut, which
runs them from ``mutants/`` without ``alembic.ini``) never connect nor migrate.
``tests/conftest.py`` has already pointed ``POSTGRES_DB`` at the worker.

``app.*`` is imported inside the functions, like in ``tests/conftest.py``.
"""

import asyncio
import re
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from alembic.config import Config
from redis.asyncio import Redis
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import command
from tests.integration.workers import BASE_DATABASE, worker_redis_db

if TYPE_CHECKING:
    from app.infrastructure.persistence.config import DatabaseSettings

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Only names that need no escaping reach CREATE DATABASE (ADR-0024).
SAFE_DATABASE_NAME = re.compile(r"[a-z_][a-z0-9_]{0,62}")
DATABASE_EXISTS = text(
    "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = :name)"
)


async def _create_database(settings: DatabaseSettings, name: str) -> None:
    """Create ``name`` from a connection to the base database, if it is missing."""
    if SAFE_DATABASE_NAME.fullmatch(name) is None:
        raise pytest.UsageError(f"unsafe test database name: {name!r}")
    engine = create_async_engine(settings.database_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as connection:
            if await connection.scalar(DATABASE_EXISTS, {"name": name}):
                return
            quoted = connection.dialect.identifier_preparer.quote_identifier(name)
            await connection.exec_driver_sql(f"CREATE DATABASE {quoted}")
    finally:
        await engine.dispose()


def _migrate() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="session", autouse=True)
def _worker_database(request: pytest.FixtureRequest) -> None:
    """Create and migrate the worker database before the first integration test.

    A session fixture, not ``pytest_configure``: under xdist, coverage starts
    after ``pytest_configure``, and the migrations import every table module.
    """
    base = request.config.stash.get(BASE_DATABASE, None)
    if base is None:
        return
    from app.infrastructure.persistence.config import DatabaseSettings

    settings = DatabaseSettings()
    if settings.postgres_db != base:
        asyncio.run(
            _create_database(
                settings.model_copy(update={"postgres_db": base}), settings.postgres_db
            )
        )
    _migrate()


@pytest.fixture
async def redis(worker_id: str) -> AsyncIterator[Redis]:
    """The Redis database of this worker (never 0), emptied before and after."""
    from app.infrastructure.cache.config import RedisSettings

    client = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
    # The URL carries the worker index (REDIS_DB); never flush database 0.
    assert (
        client.connection_pool.connection_kwargs["db"]
        == worker_redis_db(worker_id)
        != 0
    )
    try:
        await client.flushdb()
        yield client
    finally:
        await client.flushdb()
        await client.aclose()


@pytest.fixture
def captured_sql(engine: AsyncEngine) -> Iterator[list[tuple[str, Any]]]:
    """Every statement the module's ``engine`` fixture sends, with its parameters."""
    statements: list[tuple[str, Any]] = []

    def capture(
        conn: Any, cursor: Any, statement: str, parameters: Any, *args: Any
    ) -> None:
        statements.append((statement, parameters))

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    yield statements
    event.remove(engine.sync_engine, "before_cursor_execute", capture)
