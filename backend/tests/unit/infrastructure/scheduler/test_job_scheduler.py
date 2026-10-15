import asyncio
import logging
from collections.abc import AsyncIterator

import pytest

from app.infrastructure.scheduler.apscheduler import ApschedulerJobScheduler

TIMEOUT = 3.0


@pytest.fixture
async def scheduler() -> AsyncIterator[ApschedulerJobScheduler]:
    instance = ApschedulerJobScheduler()
    yield instance
    if instance.running:
        await instance.shutdown()


async def test_start_and_shutdown_toggle_running(
    scheduler: ApschedulerJobScheduler,
) -> None:
    assert scheduler.running is False

    scheduler.start()
    assert scheduler.running is True

    await scheduler.shutdown()
    assert scheduler.running is False


async def test_interval_job_runs_repeatedly(
    scheduler: ApschedulerJobScheduler,
) -> None:
    runs = 0
    twice = asyncio.Event()

    async def tick() -> None:
        nonlocal runs
        runs += 1
        if runs >= 2:
            twice.set()

    scheduler.add_interval_job("tick", tick, seconds=0.05)
    scheduler.start()

    await asyncio.wait_for(twice.wait(), TIMEOUT)
    assert runs >= 2


async def test_job_never_overlaps_itself(
    scheduler: ApschedulerJobScheduler,
) -> None:
    running = 0
    max_running = 0
    runs = 0
    finished = asyncio.Event()

    async def slow() -> None:
        nonlocal running, max_running, runs
        running += 1
        max_running = max(max_running, running)
        await asyncio.sleep(0.15)
        running -= 1
        runs += 1
        if runs >= 2:
            finished.set()

    scheduler.add_interval_job("slow", slow, seconds=0.02)
    scheduler.start()

    await asyncio.wait_for(finished.wait(), TIMEOUT)
    assert max_running == 1


async def test_failing_job_is_logged_and_others_keep_running(
    scheduler: ApschedulerJobScheduler, caplog: pytest.LogCaptureFixture
) -> None:
    failures = 0
    healthy_runs = 0
    done = asyncio.Event()

    async def boom() -> None:
        nonlocal failures
        failures += 1
        raise RuntimeError("boom")

    async def healthy() -> None:
        nonlocal healthy_runs
        healthy_runs += 1
        if failures >= 2 and healthy_runs >= 2:
            done.set()

    scheduler.add_interval_job("boom", boom, seconds=0.05)
    scheduler.add_interval_job("healthy", healthy, seconds=0.05)
    with caplog.at_level(logging.ERROR):
        scheduler.start()
        await asyncio.wait_for(done.wait(), TIMEOUT)

    assert scheduler.running is True
    records = [r for r in caplog.records if getattr(r, "job", None) == "boom"]
    assert len(records) >= 2
    assert "boom" in records[0].getMessage()
    assert records[0].exc_info is not None


async def test_registering_same_name_replaces_the_job(
    scheduler: ApschedulerJobScheduler,
) -> None:
    calls: list[str] = []
    replaced = asyncio.Event()

    async def first() -> None:
        calls.append("first")

    async def second() -> None:
        calls.append("second")
        replaced.set()

    scheduler.add_interval_job("job", first, seconds=0.05)
    scheduler.add_interval_job("job", second, seconds=0.05)
    scheduler.start()

    await asyncio.wait_for(replaced.wait(), TIMEOUT)
    assert "first" not in calls
