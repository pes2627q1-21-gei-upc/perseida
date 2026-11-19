import uuid
from datetime import UTC, datetime

from app.domain.achievements.models import Achievement, UserAchievement


class FakeAchievementRepository:
    """In-memory catalog and unlocks. Records every ``unlock`` call."""

    def __init__(self, *catalog: Achievement) -> None:
        self.catalog = list(catalog)
        self.unlocked: dict[uuid.UUID, dict[uuid.UUID, UserAchievement]] = {}
        self.unlock_calls: list[tuple[uuid.UUID, set[uuid.UUID]]] = []

    async def list_catalog(self) -> list[Achievement]:
        return list(self.catalog)

    async def list_unlocked_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        return set(self.unlocked.get(user_id, {}))

    async def unlock(
        self, user_id: uuid.UUID, achievement_ids: set[uuid.UUID]
    ) -> list[UserAchievement]:
        self.unlock_calls.append((user_id, set(achievement_ids)))
        owned = self.unlocked.setdefault(user_id, {})
        created = [
            UserAchievement(
                id=uuid.uuid4(),
                user_id=user_id,
                achievement_id=achievement_id,
                unlocked_at=datetime.now(UTC),
            )
            for achievement_id in achievement_ids
            if achievement_id not in owned
        ]
        owned.update({item.achievement_id: item for item in created})
        return created
