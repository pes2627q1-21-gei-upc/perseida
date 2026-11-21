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

    async def require_event(self, event_id: uuid.UUID) -> None:
        """Check event existence without creating a room.

        Raises:
            NotFoundError: if the event does not exist.
        """
        ...

    async def get_or_create_room(self, event_id: uuid.UUID) -> EventChatRoom:
        """Return the room of ``event_id``, creating it if it has none.

        Two requests at once end up with the same room.

        Raises:
            NotFoundError: if the event does not exist.
        """
        ...

    async def find_by_client_id(
        self, author_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> ChatMessage | None:
        """Return the message ``author_id`` sent with ``client_message_id``, if any.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def add_message(self, message: ChatMessage) -> ChatMessage:
        """Store ``message`` and return the stored one.

        If the author already stored a message with the same ``client_message_id``
        (a concurrent retry), nothing is inserted and that one is returned.

        Raises:
            NotFoundError: if the room of the message does not exist.
            ExternalServiceError: if the database is unavailable.
        """
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


class RepublishGuard(Protocol):
    """Remembers for a while which messages were just published (anti-flood)."""

    async def was_published_recently(
        self, author_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> bool:
        """Return whether the message was marked in the cooldown window.

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...

    async def mark_published(
        self, author_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> None:
        """Mark the message as published now.

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...


class EventSubscriptions(Protocol):
    """Who follows which event (US #53)."""

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        """Return whether ``user_id`` is subscribed to ``event_id``."""
        ...
