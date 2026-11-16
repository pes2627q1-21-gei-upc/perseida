import uuid
from collections.abc import Callable
from datetime import date
from typing import Literal, overload

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

    async def register_activity(
        self, user_id: uuid.UUID, today: Callable[[], date]
    ) -> DailyStreak:
        # One transaction: lock the row, read the day, write. A second request
        # waits for the lock, so it sees what the first one wrote, and reads its
        # day later (the clock only moves forward). The first activity has no
        # row to lock: the insert is the guard, and the loser of the race locks
        # the winner's row.
        async with self._session_factory() as session, session.begin():
            row = await self._lock(session, user_id)
            if row is None:
                streak = DailyStreak.start(user_id, today())
                inserted = await session.execute(
                    insert(StreakRow)
                    .values(
                        id=streak.id,
                        user_id=streak.user_id,
                        current_count=streak.current_count,
                        last_activity_date=streak.last_activity_date,
                    )
                    .on_conflict_do_nothing(index_elements=[col(StreakRow.user_id)])
                    .returning(col(StreakRow.id))
                )
                if inserted.scalar_one_or_none() is not None:
                    return streak
                row = await self._lock(session, user_id, required=True)
            current = _to_domain(row)
            updated = current.register_activity(today())
            if updated != current:
                row.current_count = updated.current_count
                row.last_activity_date = updated.last_activity_date
            return updated

    @overload
    @staticmethod
    async def _lock(
        session: AsyncSession, user_id: uuid.UUID, *, required: Literal[True]
    ) -> StreakRow: ...

    @overload
    @staticmethod
    async def _lock(
        session: AsyncSession, user_id: uuid.UUID, *, required: bool = False
    ) -> StreakRow | None: ...

    @staticmethod
    async def _lock(
        session: AsyncSession, user_id: uuid.UUID, *, required: bool = False
    ) -> StreakRow | None:
        result = await session.execute(
            select(StreakRow).where(col(StreakRow.user_id) == user_id).with_for_update()
        )
        return result.scalar_one() if required else result.scalar_one_or_none()
