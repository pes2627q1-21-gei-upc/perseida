import pytest
from pydantic import ValidationError

from app.domain.health.models import HealthReport, HealthStatus


def test_report_is_ok_when_all_components_are_up() -> None:
    report = HealthReport.from_checks({"app": True, "db": True})

    assert report.status is HealthStatus.OK
    assert report.components == {"app": HealthStatus.OK, "db": HealthStatus.OK}


def test_report_is_down_when_any_component_is_down() -> None:
    report = HealthReport.from_checks({"app": True, "db": False})

    assert report.status is HealthStatus.DOWN
    assert report.components["db"] is HealthStatus.DOWN
    assert report.components["app"] is HealthStatus.OK


def test_report_is_immutable() -> None:
    report = HealthReport.from_checks({"app": True})

    with pytest.raises(ValidationError):
        report.status = HealthStatus.DOWN  # type: ignore[misc]
