import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.achievements.models import Achievement, UserAchievement
from app.infrastructure.achievements.tables import AchievementRow, UserAchievementRow


class SqlAchievementRepository:
    """``AchievementRepository`` on PostgreSQL; each call is its own transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_catalog(self) -> list[Achievement]:
        async with self._session_factory() as session:
            result = await session.execute(select(AchievementRow))
            return [
                Achievement.model_validate(row, from_attributes=True)
                for row in result.scalars()
            ]

    async def list_unlocked_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(col(UserAchievementRow.achievement_id)).where(
                    col(UserAchievementRow.user_id) == user_id
                )
            )
            return set(result.scalars())

    async def list_unlocked_at(self, user_id: uuid.UUID) -> dict[uuid.UUID, datetime]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(
                    col(UserAchievementRow.achievement_id),
                    col(UserAchievementRow.unlocked_at),
                ).where(col(UserAchievementRow.user_id) == user_id)
            )
            return {row.achievement_id: row.unlocked_at for row in result}

    async def unlock(
        self, user_id: uuid.UUID, achievement_ids: set[uuid.UUID]
    ) -> list[UserAchievement]:
        if not achievement_ids:
            return []
        # The unique (user, achievement) pair is the guard: a concurrent call that
        # loses the race inserts nothing, so RETURNING reports each unlock once.
        async with self._session_factory() as session, session.begin():
            result = await session.execute(
                insert(UserAchievementRow)
                .values(
                    [
                        {"user_id": user_id, "achievement_id": achievement_id}
                        for achievement_id in achievement_ids
                    ]
                )
                .on_conflict_do_nothing(
                    index_elements=[
                        col(UserAchievementRow.user_id),
                        col(UserAchievementRow.achievement_id),
                    ]
                )
                .returning(
                    col(UserAchievementRow.id),
                    col(UserAchievementRow.achievement_id),
                    col(UserAchievementRow.unlocked_at),
                )
            )
            return [
                UserAchievement(
                    id=row.id,
                    user_id=user_id,
                    achievement_id=row.achievement_id,
                    unlocked_at=row.unlocked_at,
                )
                for row in result
            ]
