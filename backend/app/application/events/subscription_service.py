import json
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.application.shared.errors import ExternalServiceError
from app.domain.events.errors import EVENT_NOT_FOUND
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.events.ports import EventRepository, EventSubscriptionRepository
from app.domain.realtime.models import chat_event_room, room_revocation_channel
from app.domain.shared.errors import NotFoundError
from app.domain.shared.ports import PubSub

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(UTC)


class SubscriptionService:
    """Subscriptions of a user to astronomical events (TG-53)."""

    def __init__(
        self,
        events: EventRepository,
        subscriptions: EventSubscriptionRepository,
        pubsub: PubSub,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._events = events
        self._subscriptions = subscriptions
        self._pubsub = pubsub
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

    async def unsubscribe(
        self, user_id: uuid.UUID, event_id: uuid.UUID, *, google_sub: str
    ) -> None:
        """Remove the subscription, if any. Idempotent: the event need not exist.

        Then announce to the open WebSockets of the user (``google_sub``, the
        ``sub`` of the session) that the chat room of the event is lost. If the
        bus is down the unsubscription stands and a warning is logged.
        """
        await self._subscriptions.remove(user_id, event_id)
        try:
            await self._pubsub.publish(
                room_revocation_channel(google_sub),
                json.dumps({"room": chat_event_room(event_id)}),
            )
        except ExternalServiceError:
            # Already logged by the pub/sub adapter; the unsubscription stands.
            logger.warning("The loss of a chat room was not announced")

    async def list_mine(self, user_id: uuid.UUID) -> list[AstronomicalEvent]:
        """Return the events ``user_id`` follows, by ``starts_at`` and ``id``."""
        return await self._subscriptions.list_events_of(user_id)
