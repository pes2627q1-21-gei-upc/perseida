import uuid
from collections.abc import Callable
from datetime import date
from typing import Protocol

from app.domain.streaks.models import DailyStreak


class StreakRepository(Protocol):
    async def get_by_user_id(self, user_id: uuid.UUID) -> DailyStreak | None:
        """Return the streak of a user, or ``None`` if there is none yet."""
        ...

    async def register_activity(
        self, user_id: uuid.UUID, today: Callable[[], date]
    ) -> DailyStreak:
        """Record an activity of the user and return the saved streak.

        Read and write are one atomic step per user, so concurrent calls
        cannot overwrite each other. ``today`` is called only once the
        streak is locked: calls are then ordered, and so are their days.
        """
        ...
