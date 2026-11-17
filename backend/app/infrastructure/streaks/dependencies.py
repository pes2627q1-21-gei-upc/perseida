from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.streaks.streak_service import StreakService
from app.infrastructure.streaks.repository import SqlStreakRepository


def get_streak_service(conn: HTTPConnection) -> StreakService:
    # Light objects over the engine created in the lifespan.
    return StreakService(SqlStreakRepository(conn.app.state.session_factory))


StreakServiceDep = Annotated[StreakService, Depends(get_streak_service)]
