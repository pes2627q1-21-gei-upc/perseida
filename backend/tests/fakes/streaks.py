import uuid

from app.domain.streaks.models import DailyStreak


class FakeStreakRepository:
    """In-memory streaks by ``user_id``. Records every save."""

    def __init__(self, *streaks: DailyStreak) -> None:
        self.streaks: dict[uuid.UUID, DailyStreak] = {s.user_id: s for s in streaks}
        self.saved: list[DailyStreak] = []

    async def get_by_user_id(self, user_id: uuid.UUID) -> DailyStreak | None:
        return self.streaks.get(user_id)

    async def save(self, streak: DailyStreak) -> None:
        self.streaks[streak.user_id] = streak
        self.saved.append(streak)
