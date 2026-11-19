import uuid
from typing import Protocol

from app.domain.achievements.models import Achievement, UserAchievement


class AchievementRepository(Protocol):
    async def list_catalog(self) -> list[Achievement]:
        """Return every achievement of the catalog."""
        ...

    async def list_unlocked_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        """Return the ids of the achievements the user has unlocked."""
        ...

    async def unlock(
        self, user_id: uuid.UUID, achievement_ids: set[uuid.UUID]
    ) -> list[UserAchievement]:
        """Unlock achievements for a user, atomically and idempotently.

        Return only the ones unlocked by this call: those already unlocked
        (even by a concurrent call) are skipped, so none is reported twice.
        """
        ...
