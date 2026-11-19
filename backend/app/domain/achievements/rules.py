import uuid
from collections.abc import Collection, Iterable

from app.domain.achievements.models import (
    Achievement,
    AchievementCategory,
    AchievementKind,
)


def unlockable(
    catalog: Iterable[Achievement],
    kind: AchievementKind,
    value: int,
    already_unlocked: Collection[uuid.UUID],
) -> list[Achievement]:
    """Return the achievements of ``kind`` reached by ``value`` and still locked."""
    return [
        achievement
        for achievement in catalog
        if achievement.kind is kind
        and value >= achievement.threshold
        and achievement.id not in already_unlocked
    ]


def progress(
    achievement: Achievement, current_value: int, *, unlocked: bool
) -> tuple[int, int]:
    """Return ``(done, goal)``: ``done`` is clamped to ``0..goal``.

    An unlocked achievement is always complete, whatever the current value.
    """
    goal = achievement.threshold
    if unlocked:
        return goal, goal
    return min(max(current_value, 0), goal), goal


def next_achievement(
    catalog: Iterable[Achievement],
    category: AchievementCategory,
    unlocked_ids: Collection[uuid.UUID],
) -> Achievement | None:
    """Return the locked achievement of ``category`` with the lowest position.

    Return ``None`` when the category has none left (or none at all).
    """
    locked = [
        achievement
        for achievement in catalog
        if achievement.category is category and achievement.id not in unlocked_ids
    ]
    return min(locked, key=lambda achievement: achievement.position, default=None)
