import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.domain.streaks.models import DailyStreak
from app.domain.streaks.ports import StreakRepository


def _utc_now() -> datetime:
    return datetime.now(UTC)


class StreakService:
    def __init__(
        self,
        streaks: StreakRepository,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._streaks = streaks
        self._now = now

    async def register_activity(self, user_id: uuid.UUID) -> DailyStreak:
        """Record an activity of the user on the current UTC day.

        Creates the streak on the first activity, otherwise extends or
        restarts it. Returns the saved streak.
        """
        today = self._now().astimezone(UTC).date()
        streak = await self._streaks.get_by_user_id(user_id)
        streak = (
            DailyStreak.start(user_id, today)
            if streak is None
            else streak.register_activity(today)
        )
        await self._streaks.save(streak)
        return streak
