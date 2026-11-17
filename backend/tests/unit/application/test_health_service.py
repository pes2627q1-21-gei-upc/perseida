import asyncio
import time

from app.application.health.health_service import HealthService
from app.domain.health.models import HealthStatus
from tests.fakes.health import FakeHealthCheck


async def test_check_is_ok_when_all_checks_are_up() -> None:
    service = HealthService([FakeHealthCheck("app"), FakeHealthCheck("db")])

    report = await service.check()

    assert report.status is HealthStatus.OK
    assert set(report.components) == {"app", "db"}


async def test_check_is_down_when_a_check_is_down() -> None:
    service = HealthService([FakeHealthCheck("app"), FakeHealthCheck("db", up=False)])

    report = await service.check()

    assert report.status is HealthStatus.DOWN
    assert report.components["db"] is HealthStatus.DOWN


async def test_check_without_checks_is_ok() -> None:
    report = await HealthService([]).check()

    assert report.status is HealthStatus.OK
    assert report.components == {}


async def test_check_reports_a_raising_check_as_down() -> None:
    broken = FakeHealthCheck("db", raises=True)
    service = HealthService([FakeHealthCheck("app"), broken])

    report = await service.check()

    assert report.status is HealthStatus.DOWN
    assert report.components["db"] is HealthStatus.DOWN
    assert report.components["app"] is HealthStatus.OK


async def test_tg49_c2_non_critical_check_down_keeps_the_status_ok() -> None:
    service = HealthService(
        [
            FakeHealthCheck("app"),
            FakeHealthCheck("postgres"),
            FakeHealthCheck("redis", up=False, critical=False),
        ]
    )

    report = await service.check()

    assert report.status is HealthStatus.OK
    assert report.components == {
        "app": HealthStatus.OK,
        "postgres": HealthStatus.OK,
        "redis": HealthStatus.DOWN,
    }


async def test_tg49_c2_raising_non_critical_check_keeps_the_status_ok() -> None:
    service = HealthService(
        [FakeHealthCheck("app"), FakeHealthCheck("redis", raises=True, critical=False)]
    )

    report = await service.check()

    assert report.status is HealthStatus.OK
    assert report.components["redis"] is HealthStatus.DOWN


async def test_tg49_c1_critical_check_down_makes_the_status_down() -> None:
    service = HealthService(
        [
            FakeHealthCheck("app"),
            FakeHealthCheck("postgres", up=False),
            FakeHealthCheck("redis", critical=False),
        ]
    )

    report = await service.check()

    assert report.status is HealthStatus.DOWN
    assert report.components["postgres"] is HealthStatus.DOWN
    assert report.components["redis"] is HealthStatus.OK


async def test_tg49_c3_default_timeout_is_two_seconds() -> None:
    service = HealthService(
        [
            FakeHealthCheck("postgres", delay=2.5),
            FakeHealthCheck("redis", critical=False, delay=1.8),
        ]
    )

    started = time.perf_counter()
    report = await service.check()
    elapsed = time.perf_counter() - started

    # Cut above 1.8 s and below 2.5 s: the default limit is 2 s.
    assert report.components["postgres"] is HealthStatus.DOWN
    assert report.components["redis"] is HealthStatus.OK
    assert 1.9 <= elapsed < 2.4


async def test_tg49_c3_check_slower_than_the_timeout_is_down() -> None:
    service = HealthService(
        [FakeHealthCheck("app"), FakeHealthCheck("postgres", delay=1)],
        timeout_seconds=0.05,
    )

    started = time.perf_counter()
    report = await service.check()
    elapsed = time.perf_counter() - started

    assert report.status is HealthStatus.DOWN
    assert report.components == {
        "app": HealthStatus.OK,
        "postgres": HealthStatus.DOWN,
    }
    assert elapsed < 0.5


async def test_tg49_c3_timeout_does_not_wait_for_the_check_to_clean_up() -> None:
    # A hung PostgreSQL makes closing the cancelled session slow too: the
    # response must not wait for it (it took 4 s instead of 2 s).
    hung = FakeHealthCheck("postgres", delay=5, cancel_cleanup=0.5)
    service = HealthService([FakeHealthCheck("app"), hung], timeout_seconds=0.05)

    started = time.perf_counter()
    report = await service.check()
    elapsed = time.perf_counter() - started

    assert report.components["postgres"] is HealthStatus.DOWN
    assert elapsed < 0.3
    # The abandoned check still finishes its cleanup in the background.
    await asyncio.sleep(0.7)
    assert hung.cleaned_up


async def test_tg49_c3_slow_non_critical_check_is_down_and_status_ok() -> None:
    service = HealthService(
        [FakeHealthCheck("app"), FakeHealthCheck("redis", delay=1, critical=False)],
        timeout_seconds=0.05,
    )

    report = await service.check()

    assert report.status is HealthStatus.OK
    assert report.components["redis"] is HealthStatus.DOWN


async def test_tg49_c3_check_within_the_timeout_is_up() -> None:
    service = HealthService(
        [FakeHealthCheck("postgres", delay=0.01)], timeout_seconds=1
    )

    report = await service.check()

    assert report.components["postgres"] is HealthStatus.OK


async def test_tg49_c3_checks_run_in_parallel() -> None:
    delay = 0.3
    service = HealthService(
        [
            FakeHealthCheck("postgres", delay=delay),
            FakeHealthCheck("redis", delay=delay, critical=False),
            FakeHealthCheck("scheduler", delay=delay),
        ],
        timeout_seconds=2,
    )

    started = time.perf_counter()
    report = await service.check()
    elapsed = time.perf_counter() - started

    assert report.status is HealthStatus.OK
    # Sequentially they would take 3 * delay; in parallel, about one delay.
    assert elapsed < 2 * delay
