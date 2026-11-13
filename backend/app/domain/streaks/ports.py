import uuid
from typing import Protocol

from app.domain.streaks.models import DailyStreak


class StreakRepository(Protocol):
    async def get_by_user_id(self, user_id: uuid.UUID) -> DailyStreak | None:
        """Return the streak of a user, or ``None`` if there is none yet."""
        ...

    async def save(self, streak: DailyStreak) -> None:
        """Insert or update the streak of ``streak.user_id``."""
        ...
