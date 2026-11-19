import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import (
    ColumnElement,
    Executable,
    exists,
    func,
    literal_column,
    select,
    union_all,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.events.models import (
    AstronomicalEvent,
    EventCategory,
    EventDraft,
    EventQuery,
    Location,
    Proximity,
)
from app.infrastructure.events.tables import LOCATION_GEOGRAPHY, AstronomicalEventRow


def to_entity(row: AstronomicalEventRow) -> AstronomicalEvent:
    """Map a row of ``astronomical_events`` to the domain entity."""
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


def _within(near: Proximity) -> ColumnElement[bool]:
    """Located rows within ``near``, written so the spatial index serves it.

    ``ST_DWithin`` on the indexed expression becomes an ``Index Cond``;
    ``ST_Distance(...) <= r`` would read every located row instead.
    """
    center = func.geography(
        func.ST_SetSRID(
            func.ST_MakePoint(near.location.longitude, near.location.latitude), 4326
        )
    )
    return col(AstronomicalEventRow.latitude).is_not(None) & func.ST_DWithin(
        literal_column(LOCATION_GEOGRAPHY), center, near.radius_km * 1000
    )


def _matching(query: EventQuery) -> list[ColumnElement[bool]]:
    """Conditions shared by every row of a search: the dates and categories."""
    conditions = [
        col(AstronomicalEventRow.starts_at) < query.end,
        col(AstronomicalEventRow.ends_at) >= query.start,
    ]
    if query.categories:
        conditions.append(
            col(AstronomicalEventRow.category).in_(
                sorted(category.value for category in query.categories)
            )
        )
    return conditions


def _search_statement(query: EventQuery) -> Executable:
    conditions = _matching(query)
    if query.near is None:
        return (
            select(AstronomicalEventRow)
            .where(*conditions)
            .order_by(col(AstronomicalEventRow.starts_at), col(AstronomicalEventRow.id))
        )
    # One statement: the located rows near the point (by the spatial index)
    # plus the ones without a location, which are visible from anywhere. An OR
    # of both would keep PostgreSQL from using the index.
    located = select(AstronomicalEventRow).where(*conditions, _within(query.near))
    anywhere = select(AstronomicalEventRow).where(
        *conditions, col(AstronomicalEventRow.latitude).is_(None)
    )
    both = union_all(located, anywhere).order_by(
        literal_column("starts_at"), literal_column("id")
    )
    return select(AstronomicalEventRow).from_statement(both)


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

    async def search(self, query: EventQuery) -> list[AstronomicalEvent]:
        async with self._session_factory() as session:
            rows = await session.scalars(_search_statement(query))
            return [to_entity(row) for row in rows]

    async def upsert_many(self, drafts: Sequence[EventDraft]) -> None:
        if not drafts:
            return
        # One row per key, the last one wins: ON CONFLICT cannot update a row
        # twice in the same statement.
        unique = {(draft.source, draft.external_id): draft for draft in drafts}
        statement = insert(AstronomicalEventRow).values(
            [_to_values(draft) for draft in unique.values()]
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

    async def get(self, event_id: uuid.UUID) -> AstronomicalEvent | None:
        async with self._session_factory() as session:
            row = await session.get(AstronomicalEventRow, event_id)
            return None if row is None else to_entity(row)

    async def _list(self, *conditions: ColumnElement[bool]) -> list[AstronomicalEvent]:
        statement = (
            select(AstronomicalEventRow)
            .where(*conditions)
            .order_by(col(AstronomicalEventRow.starts_at), col(AstronomicalEventRow.id))
        )
        async with self._session_factory() as session:
            rows = await session.scalars(statement)
            return [to_entity(row) for row in rows]
