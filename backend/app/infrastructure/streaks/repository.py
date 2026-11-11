import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.streaks.models import DailyStreak
from app.infrastructure.streaks.tables import StreakRow


def _to_domain(row: StreakRow) -> DailyStreak:
    return DailyStreak(
        id=row.id,
        user_id=row.user_id,
        current_count=row.current_count,
        last_activity_date=row.last_activity_date,
    )


class SqlStreakRepository:
    """``StreakRepository`` on PostgreSQL; each call is its own transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_by_user_id(self, user_id: uuid.UUID) -> DailyStreak | None:
        async with self._session_factory() as session:
            result = await session.execute(
                select(StreakRow).where(col(StreakRow.user_id) == user_id)
            )
            row = result.scalar_one_or_none()
            return None if row is None else _to_domain(row)

    async def save(self, streak: DailyStreak) -> None:
        # Atomic upsert: concurrent requests cannot count the same day twice, and
        # the row is only written when the new date is strictly later.
        statement = insert(StreakRow).values(
            id=streak.id,
            user_id=streak.user_id,
            current_count=streak.current_count,
            last_activity_date=streak.last_activity_date,
        )
        statement = statement.on_conflict_do_update(
            index_elements=[col(StreakRow.user_id)],
            set_={
                "current_count": statement.excluded.current_count,
                "last_activity_date": statement.excluded.last_activity_date,
            },
            where=col(StreakRow.last_activity_date)
            < statement.excluded.last_activity_date,
        )
        async with self._session_factory() as session, session.begin():
            await session.execute(statement)
