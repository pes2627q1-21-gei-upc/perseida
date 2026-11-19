import uuid
from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.achievements.achievement_service import AchievementService
from app.application.streaks.streak_service import StreakService
from app.infrastructure.achievements.repository import SqlAchievementRepository
from app.infrastructure.streaks.repository import SqlStreakRepository


class _NoActivityLog:
    """Reads the streak for the achievements without reporting back to them."""

    async def record(self, user_id: uuid.UUID, activity: str, value: int) -> None:
        return None


def get_achievement_service(conn: HTTPConnection) -> AchievementService:
    # Light objects over the engine created in the lifespan. The streak reader
    # reports nowhere: only the streak service reports to the achievements.
    session_factory = conn.app.state.session_factory
    streak_reader = StreakService(
        SqlStreakRepository(session_factory), _NoActivityLog()
    )
    return AchievementService(
        SqlAchievementRepository(session_factory), streak_reader.get_current_streak
    )


AchievementServiceDep = Annotated[AchievementService, Depends(get_achievement_service)]
