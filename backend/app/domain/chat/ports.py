import uuid
from typing import Protocol

from app.domain.chat.models import (
    ChatCursor,
    ChatMessage,
    ChatRepositoryPage,
    ChatRoomSummary,
    EventChatRoom,
    ModerationResult,
)


class ChatRepository(Protocol):
    """Durable storage of the rooms and their messages (PostgreSQL)."""

    async def get_or_create_room(self, event_id: uuid.UUID) -> EventChatRoom:
        """Return the room of ``event_id``, creating it if it has none.

        Two requests at once end up with the same room.

        Raises:
            NotFoundError: if the event does not exist.
        """
        ...

    async def add_message(self, message: ChatMessage) -> None:
        """Store ``message``."""
        ...

    async def page(
        self, room_id: uuid.UUID, before: ChatCursor | None, limit: int
    ) -> ChatRepositoryPage:
        """Return newest first by (sent_at, id), before the exclusive key."""
        ...

    async def list_rooms_of(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        """Return the rooms of the events ``user_id`` is subscribed to, each
        with its latest message."""
        ...


class MessageModerator(Protocol):
    """Decides whether a text may be published (ADR-0007)."""

    async def moderate(self, text: str) -> ModerationResult:
        """Return the verdict on ``text``."""
        ...


class SendRateLimiter(Protocol):
    """Limits how often a user may send messages."""

    async def hit(self, user_id: uuid.UUID) -> bool:
        """Count one send of ``user_id``. Return False if the limit is exceeded.

        Raises:
            ExternalServiceError: if the counter is unavailable.
        """
        ...


class EventSubscriptions(Protocol):
    """Who follows which event (US #53)."""

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        """Return whether ``user_id`` is subscribed to ``event_id``."""
        ...


class ChatDelivery(Protocol):
    """Delivery boundary; success means durable storage and delivery accepted.

    On failure the adapter must avoid untracked partial effects and provide safe
    recovery. PostgreSQL/Redis atomicity is not established by this protocol.
    Infrastructure must resolve failures, retries and duplicate delivery, and
    coordinate channel, payload and connection identity with ADR-0030 / TG-459.
    """

    async def store_and_publish(
        self, message: ChatMessage, event_id: uuid.UUID
    ) -> None:
        """Store and deliver, or raise a controlled error on failure."""
        ...
