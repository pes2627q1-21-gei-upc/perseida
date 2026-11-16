import uuid
from collections.abc import Callable
from datetime import date

from app.domain.streaks.models import DailyStreak


class FakeStreakRepository:
    """In-memory streaks by ``user_id``. Records every registered activity."""

    def __init__(self, *streaks: DailyStreak) -> None:
        self.streaks: dict[uuid.UUID, DailyStreak] = {s.user_id: s for s in streaks}
        self.saved: list[DailyStreak] = []

    async def get_by_user_id(self, user_id: uuid.UUID) -> DailyStreak | None:
        return self.streaks.get(user_id)

    async def register_activity(
        self, user_id: uuid.UUID, today: Callable[[], date]
    ) -> DailyStreak:
        current = self.streaks.get(user_id)
        streak = (
            DailyStreak.start(user_id, today())
            if current is None
            else current.register_activity(today())
        )
        self.streaks[user_id] = streak
        self.saved.append(streak)
        return streak
