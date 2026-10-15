from collections.abc import Awaitable, Callable

import pytest

from app.infrastructure.scheduler.checks import SchedulerCheck
from app.infrastructure.scheduler.config import SchedulerSettings


class _FakeScheduler:
    def __init__(self, running: bool) -> None:
        self._running = running

    @property
    def running(self) -> bool:
        return self._running

    def add_interval_job(
        self, name: str, func: Callable[[], Awaitable[None]], *, seconds: float
    ) -> None:
        raise NotImplementedError


def test_settings_default_to_enabled_and_utc(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SCHEDULER_ENABLED", raising=False)
    monkeypatch.delenv("SCHEDULER_TIMEZONE", raising=False)

    settings = SchedulerSettings(_env_file=None)

    assert settings.scheduler_enabled is True
    assert settings.scheduler_timezone == "UTC"


def test_settings_read_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("SCHEDULER_TIMEZONE", "Europe/Madrid")

    settings = SchedulerSettings(_env_file=None)

    assert settings.scheduler_enabled is False
    assert settings.scheduler_timezone == "Europe/Madrid"


@pytest.mark.parametrize("running", [True, False])
async def test_scheduler_check_reflects_running(running: bool) -> None:
    check = SchedulerCheck(_FakeScheduler(running))

    assert check.name == "scheduler"
    assert await check.is_up() is running
