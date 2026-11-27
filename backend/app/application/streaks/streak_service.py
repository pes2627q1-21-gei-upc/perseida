import logging
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime

from app.domain.shared.ports import ActivityLog
from app.domain.streaks.models import DailyStreak
from app.domain.streaks.ports import StreakRepository

logger = logging.getLogger(__name__)

STREAK_DAYS = "streak_days"


def _utc_now() -> datetime:
    return datetime.now(UTC)


class StreakService:
    def __init__(
        self,
        streaks: StreakRepository,
        activity_log: ActivityLog,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._streaks = streaks
        self._activity_log = activity_log
        self._now = now

    def _today(self) -> date:
        return self._now().astimezone(UTC).date()

    async def register_activity(self, user_id: uuid.UUID) -> DailyStreak:
        """Record an activity of the user on the current UTC day.

        Creates the streak on the first activity, otherwise extends or
        restarts it. Returns the saved streak. Then tells the activity log the
        current streak; if that fails the streak stays saved and only a warning
        is logged.
        """
        streak = await self._streaks.register_activity(user_id, self._today)
        try:
            await self._activity_log.record(user_id, STREAK_DAYS, streak.current_count)
        except Exception:
            logger.warning("Could not record the streak activity", exc_info=True)
        return streak

    async def get_current_streak(self, user_id: uuid.UUID) -> int:
        """Return the streak length of the user as of the current UTC day.

        Returns 0 when the user has no streak or it has lapsed. Read-only:
        never writes to the repository.
        """
        streak = await self._streaks.get_by_user_id(user_id)
        return 0 if streak is None else streak.count_on(self._today())
