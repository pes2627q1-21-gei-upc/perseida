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
