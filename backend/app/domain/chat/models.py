import uuid
from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, field_validator

from app.domain.chat.errors import (
    CHAT_MESSAGE_EMPTY,
    CHAT_MESSAGE_TOO_LONG,
    MESSAGE_MAX_LENGTH,
)
from app.domain.shared.errors import ValidationError
from app.domain.shared.text import clean_user_text, has_visible_text


class EventChatRoom(BaseModel):
    """The chat room of an astronomical event: at most one per event."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    event_id: uuid.UUID
    created_at: AwareDatetime

    @classmethod
    def create(cls, *, event_id: uuid.UUID) -> EventChatRoom:
        """Open the room of ``event_id``."""
        return cls(id=uuid.uuid7(), event_id=event_id, created_at=datetime.now(UTC))


class ChatAuthor(BaseModel):
    """The author of a chat message.

    ``name`` is the profile name, or ``None`` when the account has none: the email
    is personal data and is never shown to the room.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    name: str | None


class ChatMessage(BaseModel):
    """A text message sent by a user to a room. Messages are never edited."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    room_id: uuid.UUID
    author: ChatAuthor
    text: str
    sent_at: AwareDatetime
    # Idempotency key chosen by the sender: unique per author, so a retry of the
    # same send never stores a second message (it is not published to the room).
    client_message_id: uuid.UUID

    @field_validator("text")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        cleaned = clean_user_text(value)
        if not has_visible_text(cleaned):
            raise ValidationError(CHAT_MESSAGE_EMPTY, "Message must not be empty")
        if len(cleaned) > MESSAGE_MAX_LENGTH:
            raise ValidationError(
                CHAT_MESSAGE_TOO_LONG,
                f"Message must have at most {MESSAGE_MAX_LENGTH} characters",
            )
        return cleaned

    @classmethod
    def create(
        cls,
        *,
        room_id: uuid.UUID,
        author: ChatAuthor,
        text: str,
        client_message_id: uuid.UUID,
    ) -> ChatMessage:
        """Build a new message; the server sets its id and ``sent_at``."""
        return cls(
            id=uuid.uuid7(),
            room_id=room_id,
            author=author,
            text=text,
            sent_at=datetime.now(UTC),
            client_message_id=client_message_id,
        )


class ChatCursor(BaseModel):
    """Exclusive history position, ordered by timestamp and id."""

    model_config = ConfigDict(frozen=True)
    sent_at: AwareDatetime
    id: uuid.UUID


class ChatMessagePage(BaseModel):
    """One page of a room's history, newest first.

    ``next_cursor`` is an opaque cursor, or None when there are no older messages.
    """

    model_config = ConfigDict(frozen=True)

    messages: list[ChatMessage]
    next_cursor: str | None = None


class ChatRoomSummary(BaseModel):
    """A room of the list of a user, with its latest message if it has any."""

    model_config = ConfigDict(frozen=True)

    room: EventChatRoom
    last_message: ChatMessage | None = None


class ChatRepositoryPage(BaseModel):
    """Repository page with a decoded key for the next page."""

    model_config = ConfigDict(frozen=True)
    messages: list[ChatMessage]
    next_cursor: ChatCursor | None = None
