import uuid
from collections.abc import Iterable

from app.domain.events.models import AstronomicalEvent, EventSubscription


class InMemoryEventSubscriptionRepository:
    """In-memory EventSubscriptionRepository (TG-53).

    ``events`` are the stored events ``list_events_of`` can return; the
    subscriptions are kept by ``(user_id, event_id)``, so a second ``add`` of
    the same pair keeps the first one.
    """

    def __init__(
        self,
        events: Iterable[AstronomicalEvent] = (),
        subscriptions: Iterable[EventSubscription] = (),
    ) -> None:
        self._events = {event.id: event for event in events}
        self.subscriptions: dict[tuple[uuid.UUID, uuid.UUID], EventSubscription] = {
            (s.user_id, s.event_id): s for s in subscriptions
        }

    async def add(self, subscription: EventSubscription) -> bool:
        key = (subscription.user_id, subscription.event_id)
        if key in self.subscriptions:
            return False
        self.subscriptions[key] = subscription
        return True

    async def remove(self, user_id: uuid.UUID, event_id: uuid.UUID) -> None:
        self.subscriptions.pop((user_id, event_id), None)

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        return (user_id, event_id) in self.subscriptions

    async def list_events_of(self, user_id: uuid.UUID) -> list[AstronomicalEvent]:
        events = [
            self._events[event_id]
            for owner, event_id in self.subscriptions
            if owner == user_id
        ]
        return sorted(events, key=lambda event: (event.starts_at, event.id))
