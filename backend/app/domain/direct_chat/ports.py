import uuid
from datetime import datetime
from typing import Protocol

from app.domain.direct_chat.models import (
    DirectConversation,
    DirectCursor,
    DirectMessage,
    DirectMessagePage,
)


class DirectConversationRepository(Protocol):
    """Durable storage of the direct conversations (PostgreSQL)."""

    async def get_or_create(
        self, user_a_id: uuid.UUID, user_b_id: uuid.UUID
    ) -> tuple[DirectConversation, bool]:
        """Return the conversation of the pair (any order) and whether it was created.

        Two requests at once end up with the same conversation.

        Raises:
            BusinessRuleViolation: CANNOT_MESSAGE_SELF if both users are the same.
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def get(self, conversation_id: uuid.UUID) -> DirectConversation | None:
        """Return the conversation, or None if it does not exist.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def mark_read(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, at: datetime
    ) -> DirectConversation:
        """Move the read mark of ``user_id`` to ``at`` (never backwards).

        ``at`` must be timezone-aware.

        Raises:
            NotFoundError: CONVERSATION_NOT_FOUND if the conversation does not
                exist or ``user_id`` is a stranger.
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def list_of(self, user_id: uuid.UUID) -> list[DirectConversation]:
        """Return the conversations ``user_id`` takes part in.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...


class DirectMessageRepository(Protocol):
    """Durable storage of the direct messages (PostgreSQL)."""

    async def find_by_client_id(
        self, sender_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> DirectMessage | None:
        """Return the message ``sender_id`` sent with ``client_message_id``, if any.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def add(self, message: DirectMessage) -> DirectMessage:
        """Store ``message`` and return the stored one.

        If the sender already stored a message with the same ``client_message_id``
        (a concurrent retry), nothing is inserted and that one is returned.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def page(
        self, conversation_id: uuid.UUID, before: DirectCursor | None, limit: int
    ) -> DirectMessagePage:
        """Return newest first by (sent_at, id), before the exclusive key.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def count_unread(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, since: datetime | None
    ) -> int:
        """Count the messages of the other participant sent after ``since``.

        Without ``since`` every message of the other participant counts. ``since``
        must be timezone-aware.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...


class UserBlockRepository(Protocol):
    """Durable storage of the blocks between users (PostgreSQL)."""

    async def block(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> None:
        """Record that ``blocker_id`` blocks ``blocked_id``. Idempotent.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def unblock(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> None:
        """Remove the block, if any. Idempotent.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...

    async def is_blocked(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> bool:
        """Return whether ``blocker_id`` blocks ``blocked_id`` (directional).

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        ...


class PushNotifier(Protocol):
    """Tells a recipient who is not connected that a message arrived."""

    async def notify(self, recipient_id: uuid.UUID, message: DirectMessage) -> None:
        """Notify ``recipient_id`` of ``message``."""
        ...
