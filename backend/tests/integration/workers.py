"""Database and Redis index of each pytest-xdist worker (TG-362).

``worker_id`` is ``master`` without ``-n`` and ``gw0``, ``gw1``... with it. Redis
has 16 logical databases (0..15): 0 is the development one and is never used, so
the workers take 15, 14... down to 1.
"""

import re

import pytest

REDIS_TEST_DB = 15
# Name of the database in the environment before the worker suffix is added;
# set by tests/conftest.py, read by tests/integration/conftest.py.
BASE_DATABASE = pytest.StashKey[str]()
_WORKER = re.compile(r"gw(?P<number>\d+)")


def _worker_number(worker_id: str) -> int | None:
    if worker_id == "master":
        return None
    match = _WORKER.fullmatch(worker_id)
    if match is None:
        raise ValueError(f"unknown pytest-xdist worker id: {worker_id!r}")
    return int(match["number"])


def worker_database_name(base: str, worker_id: str) -> str:
    """``base`` without xdist; ``{base}_gwN`` for worker ``gwN``."""
    if _worker_number(worker_id) is None:
        return base
    return f"{base}_{worker_id}"


def worker_redis_db(worker_id: str) -> int:
    """Index 15 without xdist; ``15 - N`` for worker ``gwN`` (never 0)."""
    number = _worker_number(worker_id) or 0
    if number >= REDIS_TEST_DB:
        raise ValueError(
            f"worker {worker_id} has no free Redis database (only 1..15): "
            f"run pytest with -n {REDIS_TEST_DB} or fewer workers"
        )
    return REDIS_TEST_DB - number
