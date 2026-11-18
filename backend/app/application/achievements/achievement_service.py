import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.domain.achievements.models import (
    Achievement,
    AchievementKind,
    UserAchievement,
)
from app.domain.achievements.ports import AchievementRepository
from app.domain.achievements.rules import progress, unlockable

StreakDays = Callable[[uuid.UUID], Awaitable[int]]


@dataclass(frozen=True)
class AchievementProgress:
    """One catalog achievement as seen by a user: ``current`` of ``goal``."""

    achievement: Achievement
    current: int
    goal: int
    unlocked: bool


class AchievementService:
    def __init__(
        self, achievements: AchievementRepository, streak_days: StreakDays
    ) -> None:
        self._achievements = achievements
        self._streak_days = streak_days

    async def record_activity(
        self, user_id: uuid.UUID, activity: str, value: int
    ) -> list[UserAchievement]:
        """Unlock the achievements the user reaches by doing ``activity``.

        ``value`` is the user's total for that activity (e.g. 7 streak days).
        Returns only the achievements unlocked by this call; an unknown
        activity unlocks nothing.
        """
        try:
            kind = AchievementKind(activity)
        except ValueError:
            return []
        catalog = await self._achievements.list_catalog()
        unlocked_ids = await self._achievements.list_unlocked_ids(user_id)
        reached = unlockable(catalog, kind, value, unlocked_ids)
        if not reached:
            return []
        return await self._achievements.unlock(
            user_id, {achievement.id for achievement in reached}
        )

    async def list_progress(self, user_id: uuid.UUID) -> list[AchievementProgress]:
        """Return every catalog achievement with the user's progress on it."""
        catalog = await self._achievements.list_catalog()
        unlocked_ids = await self._achievements.list_unlocked_ids(user_id)
        streak = await self._streak_days(user_id)
        items: list[AchievementProgress] = []
        for achievement in catalog:
            unlocked = achievement.id in unlocked_ids
            current_value = (
                streak if achievement.kind is AchievementKind.STREAK_DAYS else 0
            )
            current, goal = progress(achievement, current_value, unlocked=unlocked)
            items.append(AchievementProgress(achievement, current, goal, unlocked))
        return items
