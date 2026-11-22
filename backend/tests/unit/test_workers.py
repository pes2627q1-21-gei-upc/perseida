"""Each xdist worker gets its own database and Redis index (TG-362, US #362,
criteri 2: ``pytest -n auto`` without collisions in the database or Redis)."""

import pytest

from tests.integration.workers import worker_database_name, worker_redis_db

WORKERS = [f"gw{n}" for n in range(15)]


def test_tg362_without_xdist_the_database_keeps_its_name() -> None:
    assert worker_database_name("perseida_ci", "master") == "perseida_ci"


@pytest.mark.parametrize(
    ("worker_id", "expected"),
    [
        ("gw0", "perseida_ci_gw0"),
        ("gw1", "perseida_ci_gw1"),
        ("gw14", "perseida_ci_gw14"),
    ],
)
def test_tg362_each_worker_has_its_own_database(worker_id: str, expected: str) -> None:
    assert worker_database_name("perseida_ci", worker_id) == expected


def test_tg362_worker_databases_never_collide() -> None:
    names = {worker_database_name("perseida_ci", w) for w in ["master", *WORKERS]}

    assert len(names) == len(WORKERS) + 1


def test_tg362_without_xdist_redis_keeps_index_15() -> None:
    assert worker_redis_db("master") == 15


@pytest.mark.parametrize(
    ("worker_id", "expected"), [("gw0", 15), ("gw1", 14), ("gw14", 1)]
)
def test_tg362_each_worker_has_its_own_redis_index(
    worker_id: str, expected: int
) -> None:
    assert worker_redis_db(worker_id) == expected


def test_tg362_worker_redis_indexes_are_unique_and_never_the_development_one() -> None:
    indexes = [worker_redis_db(w) for w in WORKERS]

    assert len(set(indexes)) == len(WORKERS)
    assert all(1 <= index <= 15 for index in indexes)
    assert 0 not in indexes


@pytest.mark.parametrize("worker_id", ["gw15", "gw16", "gw99"])
def test_tg362_too_many_workers_for_redis_is_a_clear_error(worker_id: str) -> None:
    with pytest.raises(ValueError, match=r"-n"):
        worker_redis_db(worker_id)
