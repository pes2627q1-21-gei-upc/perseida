from datetime import datetime

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.events.models import AstronomicalEvent, EventCategory, Location
from app.infrastructure.events.tables import AstronomicalEventRow


def _to_entity(row: AstronomicalEventRow) -> AstronomicalEvent:
    location = (
        None
        if row.latitude is None or row.longitude is None
        else Location(latitude=row.latitude, longitude=row.longitude)
    )
    return AstronomicalEvent(
        id=row.id,
        title=row.title,
        summary=row.summary,
        category=EventCategory(row.category),
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        location=location,
        source_url=row.source_url,
    )


class SqlEventRepository:
    """Astronomical events stored in PostgreSQL. Each call uses its own session."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        return await self._list(
            col(AstronomicalEventRow.starts_at) < end,
            col(AstronomicalEventRow.ends_at) >= start,
        )

    async def list_starting_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        return await self._list(
            col(AstronomicalEventRow.starts_at) >= start,
            col(AstronomicalEventRow.starts_at) < end,
        )

    async def _list(self, *conditions: ColumnElement[bool]) -> list[AstronomicalEvent]:
        statement = (
            select(AstronomicalEventRow)
            .where(*conditions)
            .order_by(col(AstronomicalEventRow.starts_at), col(AstronomicalEventRow.id))
        )
        async with self._session_factory() as session:
            rows = await session.scalars(statement)
            return [_to_entity(row) for row in rows]
