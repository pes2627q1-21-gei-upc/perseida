import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta, tzinfo

import pytest
from apscheduler.executors import base as executor_base
from apscheduler.schedulers import base as scheduler_base
from apscheduler.triggers import interval as interval_trigger

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


async def test_shutdown_cancels_running_job_without_logging_an_error(
    scheduler: ApschedulerJobScheduler, caplog: pytest.LogCaptureFixture
) -> None:
    started = asyncio.Event()
    cleaned_up = False

    async def long_running() -> None:
        nonlocal cleaned_up
        started.set()
        try:
            await asyncio.sleep(60)
        finally:
            cleaned_up = True

    scheduler.add_interval_job("long", long_running, seconds=0.05)
    scheduler.start()
    await asyncio.wait_for(started.wait(), TIMEOUT)

    with caplog.at_level(logging.WARNING):
        await scheduler.shutdown()

    assert cleaned_up is True
    assert [t for t in asyncio.all_tasks() if t is not asyncio.current_task()] == []
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []


async def settle() -> None:
    """Yield to the loop so submitted jobs and their completion callbacks run."""
    for _ in range(3):
        await asyncio.sleep(0)


class FakeClock:
    """Simulated wall clock injected where APScheduler reads ``datetime.now``."""

    def __init__(self, start: datetime) -> None:
        self.current = start

    def advance(self, **delta: float) -> None:
        self.current += timedelta(**delta)

    def datetime_class(self) -> type[datetime]:
        clock = self

        class _FakeDatetime(datetime):
            @classmethod
            def now(cls, tz: tzinfo | None = None) -> _FakeDatetime:
                return cls.fromtimestamp(clock.current.timestamp(), tz)

        return _FakeDatetime


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    fake = FakeClock(datetime(2026, 1, 1, tzinfo=UTC))
    fake_datetime = fake.datetime_class()
    for module in (scheduler_base, executor_base, interval_trigger):
        monkeypatch.setattr(module, "datetime", fake_datetime)
    return fake


async def test_interval_job_fires_when_simulated_clock_reaches_interval(
    clock: FakeClock,
) -> None:
    runs = 0

    async def tick() -> None:
        nonlocal runs
        runs += 1

    instance = ApschedulerJobScheduler()
    instance.add_interval_job("tick", tick, seconds=60)
    instance.start()
    try:
        instance._scheduler._process_jobs()  # noqa: SLF001
        await settle()
        assert runs == 0

        clock.advance(seconds=61)
        instance._scheduler._process_jobs()  # noqa: SLF001
        await settle()
        assert runs == 1

        clock.advance(seconds=60)
        instance._scheduler._process_jobs()  # noqa: SLF001
        await settle()
        assert runs == 2
    finally:
        await instance.shutdown()


async def test_missed_runs_are_coalesced_when_clock_jumps(clock: FakeClock) -> None:
    runs = 0

    async def tick() -> None:
        nonlocal runs
        runs += 1

    instance = ApschedulerJobScheduler()
    instance.add_interval_job("tick", tick, seconds=60)
    instance.start()
    try:
        clock.advance(minutes=10)
        instance._scheduler._process_jobs()  # noqa: SLF001
        await settle()
        assert runs == 1
    finally:
        await instance.shutdown()


async def test_shutdown_before_start_is_a_noop(
    scheduler: ApschedulerJobScheduler,
) -> None:
    await scheduler.shutdown()

    assert scheduler.running is False
