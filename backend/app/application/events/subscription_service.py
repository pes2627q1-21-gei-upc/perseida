import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.domain.events.errors import EVENT_NOT_FOUND
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.events.ports import EventRepository, EventSubscriptionRepository
from app.domain.shared.errors import NotFoundError


def _utc_now() -> datetime:
    return datetime.now(UTC)


class SubscriptionService:
    """Subscriptions of a user to astronomical events (TG-53)."""

    def __init__(
        self,
        events: EventRepository,
        subscriptions: EventSubscriptionRepository,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._events = events
        self._subscriptions = subscriptions
        self._now = now

    async def subscribe(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        """Subscribe ``user_id`` to ``event_id``. Return True if the subscription
        is new, False if it already existed (idempotent, even for an event that
        has ended since).

        Raises:
            NotFoundError: ``EVENT_NOT_FOUND`` if the event is not stored.
            ConflictError: ``EVENT_ALREADY_ENDED`` if the event has ended and the
                user was not subscribed.
        """
        event = await self._events.get(event_id)
        if event is None:
            raise NotFoundError(EVENT_NOT_FOUND, "Event does not exist")
        if await self._subscriptions.is_subscribed(user_id, event_id):
            return False
        subscription = EventSubscription.create(user_id, event, self._now())
        return await self._subscriptions.add(subscription)

    async def unsubscribe(self, user_id: uuid.UUID, event_id: uuid.UUID) -> None:
        """Remove the subscription, if any. Idempotent: the event need not exist."""
        await self._subscriptions.remove(user_id, event_id)

    async def list_mine(self, user_id: uuid.UUID) -> list[AstronomicalEvent]:
        """Return the events ``user_id`` follows, by ``starts_at`` and ``id``."""
        return await self._subscriptions.list_events_of(user_id)
