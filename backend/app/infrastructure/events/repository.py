import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.events.models import (
    AstronomicalEvent,
    EventCategory,
    EventDraft,
    Location,
)
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


def _to_values(draft: EventDraft) -> dict[str, Any]:
    location = draft.location
    return {
        "source": draft.source.value,
        "external_id": draft.external_id,
        "title": draft.title,
        "summary": draft.summary,
        "category": draft.category.value,
        "starts_at": draft.starts_at,
        "ends_at": draft.ends_at,
        "latitude": None if location is None else location.latitude,
        "longitude": None if location is None else location.longitude,
        "source_url": draft.source_url,
    }


# Columns a new fetch may change; ``id`` and ``created_at`` are kept.
_UPDATABLE = (
    "title",
    "summary",
    "category",
    "starts_at",
    "ends_at",
    "latitude",
    "longitude",
    "source_url",
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

    async def upsert_many(self, drafts: Sequence[EventDraft]) -> None:
        if not drafts:
            return
        statement = insert(AstronomicalEventRow).values(
            [_to_values(draft) for draft in drafts]
        )
        statement = statement.on_conflict_do_update(
            index_elements=["source", "external_id"],
            set_={name: statement.excluded[name] for name in _UPDATABLE}
            | {"updated_at": func.now()},
        )
        async with self._session_factory() as session:
            await session.execute(statement)
            await session.commit()

    async def exists(self, event_id: uuid.UUID) -> bool:
        statement = select(exists().where(col(AstronomicalEventRow.id) == event_id))
        async with self._session_factory() as session:
            return bool(await session.scalar(statement))

    async def _list(self, *conditions: ColumnElement[bool]) -> list[AstronomicalEvent]:
        statement = (
            select(AstronomicalEventRow)
            .where(*conditions)
            .order_by(col(AstronomicalEventRow.starts_at), col(AstronomicalEventRow.id))
        )
        async with self._session_factory() as session:
            rows = await session.scalars(statement)
            return [_to_entity(row) for row in rows]
