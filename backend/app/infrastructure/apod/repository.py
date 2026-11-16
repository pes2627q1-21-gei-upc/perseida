from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.apod.models import Apod, MediaType
from app.infrastructure.persistence.apod_table import ApodTable


def _to_entity(row: ApodTable) -> Apod:
    return Apod(
        apod_date=row.apod_date,
        title=row.title,
        explanation=row.explanation,
        media_type=MediaType(row.media_type),
        media_url=row.media_url,
        copyright=row.copyright,
    )


class SqlApodRepository:
    """APODs stored in PostgreSQL. Each call uses its own session."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get(self, day: date) -> Apod | None:
        async with self._session_factory() as session:
            row = await session.scalar(
                select(ApodTable).where(col(ApodTable.apod_date) == day)
            )
        return None if row is None else _to_entity(row)

    async def latest(self, until: date) -> Apod | None:
        """Return the most recent APOD dated ``until`` or earlier."""
        async with self._session_factory() as session:
            row = await session.scalar(
                select(ApodTable)
                .where(col(ApodTable.apod_date) <= until)
                .order_by(col(ApodTable.apod_date).desc())
                .limit(1)
            )
        return None if row is None else _to_entity(row)

    async def save(self, apod: Apod) -> None:
        """Store ``apod``; a date that is already stored is left as it is."""
        statement = (
            insert(ApodTable)
            .values(
                apod_date=apod.apod_date,
                title=apod.title,
                explanation=apod.explanation,
                media_type=apod.media_type.value,
                media_url=apod.media_url,
                copyright=apod.copyright,
            )
            .on_conflict_do_nothing(index_elements=["apod_date"])
        )
        async with self._session_factory() as session:
            await session.execute(statement)
            await session.commit()
