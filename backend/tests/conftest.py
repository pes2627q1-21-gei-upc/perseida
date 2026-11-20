"""One PostgreSQL database and one Redis index per pytest-xdist worker (TG-362).

Before any settings are built, each test process points ``POSTGRES_DB`` and
``REDIS_DB`` at its own worker (``master`` without ``-n``). The worker database
is created and migrated by ``tests/integration/conftest.py``, only when
integration tests run. Without ``POSTGRES_HOST``/``REDIS_HOST`` in the
environment nothing is done (the integration tests are skipped).

Under xdist, coverage starts in each worker in ``pytest_sessionstart``, after
this module is imported and after ``pytest_configure``: no ``app.*`` module may
be imported before then, or its module-level lines are lost from the report.
So ``REDIS_DB`` (no settings needed) is set in ``pytest_configure`` and
``POSTGRES_DB`` (it reads ``DatabaseSettings``) in the last ``pytest_sessionstart``,
still before collection builds any settings.
"""

import os

import pytest

from tests.integration.workers import (
    BASE_DATABASE,
    worker_database_name,
    worker_redis_db,
)
from tests.quarantine import pytest_collection_modifyitems  # noqa: F401


def _redis_db(worker_id: str) -> int:
    try:
        return worker_redis_db(worker_id)
    except ValueError as error:
        raise pytest.UsageError(str(error)) from error


def _workers(config: pytest.Config) -> int:
    """Workers xdist will start: ``-n`` capped by ``--maxprocesses``."""
    numprocesses: int = getattr(config.option, "numprocesses", None) or 0
    maxprocesses: int | None = getattr(config.option, "maxprocesses", None)
    return min(numprocesses, maxprocesses or numprocesses)


def pytest_configure(config: pytest.Config) -> None:
    """Point ``REDIS_DB`` at this worker before any settings are built."""
    worker_id = os.environ.get("PYTEST_XDIST_WORKER", "master")
    workers = _workers(config)
    if worker_id == "master" and workers:
        # xdist controller: it runs no tests; fail early if Redis is too small.
        if os.environ.get("REDIS_HOST"):
            _redis_db(f"gw{workers - 1}")
        return
    if os.environ.get("REDIS_HOST"):
        os.environ["REDIS_DB"] = str(_redis_db(worker_id))


@pytest.hookimpl(trylast=True)
def pytest_sessionstart(session: pytest.Session) -> None:
    """Point ``POSTGRES_DB`` at this worker once coverage has started."""
    worker_id = os.environ.get("PYTEST_XDIST_WORKER", "master")
    if worker_id == "master" and _workers(session.config):
        return  # xdist controller: it runs no tests.
    if not os.environ.get("POSTGRES_HOST"):
        return
    from app.infrastructure.persistence.config import DatabaseSettings

    base = DatabaseSettings().postgres_db
    session.config.stash[BASE_DATABASE] = base
    os.environ["POSTGRES_DB"] = worker_database_name(base, worker_id)
