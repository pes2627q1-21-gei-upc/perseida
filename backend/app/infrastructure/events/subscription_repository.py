import uuid

from sqlalchemy import delete, exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.infrastructure.events.repository import to_entity
from app.infrastructure.events.tables import AstronomicalEventRow, EventSubscriptionRow


class SqlEventSubscriptionRepository:
    """Subscriptions to events stored in PostgreSQL (TG-53). Each call uses its
    own session. Also serves the chat through its ``EventSubscriptions`` port."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def add(self, subscription: EventSubscription) -> bool:
        # ON CONFLICT keeps the stored subscription, also when two requests
        # insert the same pair at once: only one of them gets the id back.
        statement = (
            insert(EventSubscriptionRow)
            .values(
                id=subscription.id,
                user_id=subscription.user_id,
                event_id=subscription.event_id,
                created_at=subscription.created_at,
            )
            .on_conflict_do_nothing(index_elements=["user_id", "event_id"])
            .returning(col(EventSubscriptionRow.id))
        )
        async with self._session_factory() as session:
            inserted = await session.scalar(statement)
            await session.commit()
        return inserted is not None

    async def remove(self, user_id: uuid.UUID, event_id: uuid.UUID) -> None:
        statement = delete(EventSubscriptionRow).where(
            col(EventSubscriptionRow.user_id) == user_id,
            col(EventSubscriptionRow.event_id) == event_id,
        )
        async with self._session_factory() as session:
            await session.execute(statement)
            await session.commit()

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        statement = select(
            exists().where(
                col(EventSubscriptionRow.user_id) == user_id,
                col(EventSubscriptionRow.event_id) == event_id,
            )
        )
        async with self._session_factory() as session:
            return bool(await session.scalar(statement))

    async def list_events_of(self, user_id: uuid.UUID) -> list[AstronomicalEvent]:
        # One query: the UNIQUE (user_id, event_id) finds the subscriptions and
        # the primary key of astronomical_events joins each event.
        statement = (
            select(AstronomicalEventRow)
            .join(
                EventSubscriptionRow,
                col(EventSubscriptionRow.event_id) == col(AstronomicalEventRow.id),
            )
            .where(col(EventSubscriptionRow.user_id) == user_id)
            .order_by(col(AstronomicalEventRow.starts_at), col(AstronomicalEventRow.id))
        )
        async with self._session_factory() as session:
            rows = await session.scalars(statement)
            return [to_entity(row) for row in rows]
