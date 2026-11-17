import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Select, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.outings.models import Outing, OutingAuthor, OutingDetails
from app.domain.shared.location import Location
from app.infrastructure.outings.tables import OutingRow
from app.infrastructure.users.tables import UserRow


def _to_details(row: OutingRow, author: UserRow) -> OutingDetails:
    return OutingDetails(
        outing=Outing(
            id=row.id,
            author_id=row.author_id,
            title=row.title,
            description=row.description,
            starts_at=row.starts_at,
            ends_at=row.ends_at,
            location=Location(latitude=row.latitude, longitude=row.longitude),
            event_id=row.event_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        ),
        author=OutingAuthor(
            id=author.id,
            display_name=author.display_name,
            avatar_url=author.avatar_url,
        ),
    )


def _to_values(outing: Outing) -> dict[str, Any]:
    return {
        "author_id": outing.author_id,
        "event_id": outing.event_id,
        "title": outing.title,
        "description": outing.description,
        "starts_at": outing.starts_at,
        "ends_at": outing.ends_at,
        "latitude": outing.location.latitude,
        "longitude": outing.location.longitude,
        "created_at": outing.created_at,
        "updated_at": outing.updated_at,
    }


def _with_author() -> Select[OutingRow, UserRow]:
    return select(OutingRow, UserRow).join(
        UserRow, col(UserRow.id) == col(OutingRow.author_id)
    )


class SqlOutingRepository:
    """``OutingRepository`` on PostgreSQL; each call is its own transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get(self, outing_id: uuid.UUID) -> OutingDetails | None:
        async with self._session_factory() as session:
            result = await session.execute(
                _with_author().where(col(OutingRow.id) == outing_id)
            )
            found = result.one_or_none()
            return None if found is None else _to_details(*found)

    async def add(self, outing: Outing) -> None:
        async with self._session_factory() as session, session.begin():
            session.add(OutingRow(id=outing.id, **_to_values(outing)))

    async def save(self, outing: Outing) -> None:
        async with self._session_factory() as session, session.begin():
            await session.execute(
                update(OutingRow)
                .where(col(OutingRow.id) == outing.id)
                .values(**_to_values(outing))
            )

    async def delete(self, outing_id: uuid.UUID) -> None:
        async with self._session_factory() as session, session.begin():
            await session.execute(
                delete(OutingRow).where(col(OutingRow.id) == outing_id)
            )

    async def list_upcoming(
        self,
        now: datetime,
        *,
        event_id: uuid.UUID | None = None,
        author_id: uuid.UUID | None = None,
    ) -> list[OutingDetails]:
        query = _with_author().where(col(OutingRow.starts_at) >= now)
        if event_id is not None:
            query = query.where(col(OutingRow.event_id) == event_id)
        if author_id is not None:
            query = query.where(col(OutingRow.author_id) == author_id)
        query = query.order_by(col(OutingRow.starts_at), col(OutingRow.id))
        async with self._session_factory() as session:
            result = await session.execute(query)
            return [_to_details(row, author) for row, author in result.all()]
