"""The streak service reports to the achievements (TG-575, US TG-58 criteris 2 i 4)."""

from types import SimpleNamespace
from typing import Any, cast

from starlette.requests import HTTPConnection

from app.application.achievements.achievement_service import AchievementService
from app.infrastructure.streaks.dependencies import get_streak_service


def test_tg575_the_streak_service_reports_to_the_achievement_service() -> None:
    conn = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(session_factory=object()))
    )

    service = get_streak_service(cast(HTTPConnection, conn))

    log: Any = service._activity_log
    assert isinstance(log, AchievementService)
