import unicodedata
import uuid
from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, field_validator

from app.domain.chat.errors import (
    CHAT_MESSAGE_EMPTY,
    CHAT_MESSAGE_TOO_LONG,
    MESSAGE_MAX_LENGTH,
)
from app.domain.shared.errors import ValidationError

# Control characters, surrogates, private-use, unassigned and format code points
# (zero-width space, bidi overrides, soft hyphen...). NUL would make PostgreSQL
# fail and the format ones can hide text or spoof it.
_DROPPED_CATEGORIES = ("Cc", "Cs", "Co", "Cn", "Cf")
# ``\n`` and ``\t`` are kept because a chat has them. ZWJ and ZWNJ are format
# characters too, but they glue composed emoji and some scripts together.
_KEPT_CHARACTERS = "\n\t\u200c\u200d"
_JOINERS = "\u200c\u200d"


def _clean_message_text(value: str) -> str:
    """Drop invisible and control characters and surrounding blanks.

    Never truncates.
    """
    kept = "".join(
        char
        for char in value
        if char in _KEPT_CHARACTERS
        or unicodedata.category(char) not in _DROPPED_CATEGORIES
    )
    return kept.strip()


def _has_visible_text(value: str) -> bool:
    """Whether ``value`` is more than blanks and joiners."""
    return bool(value.translate(str.maketrans("", "", _JOINERS)).strip())


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


class ChatMessage(BaseModel):
    """A text message sent by a user to a room. Messages are never edited."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    room_id: uuid.UUID
    author_id: uuid.UUID
    text: str
    sent_at: AwareDatetime

    @field_validator("text")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        cleaned = _clean_message_text(value)
        if not _has_visible_text(cleaned):
            raise ValidationError(CHAT_MESSAGE_EMPTY, "Message must not be empty")
        if len(cleaned) > MESSAGE_MAX_LENGTH:
            raise ValidationError(
                CHAT_MESSAGE_TOO_LONG,
                f"Message must have at most {MESSAGE_MAX_LENGTH} characters",
            )
        return cleaned

    @classmethod
    def create(
        cls, *, room_id: uuid.UUID, author_id: uuid.UUID, text: str
    ) -> ChatMessage:
        """Build a new message; the server sets its id and ``sent_at``."""
        return cls(
            id=uuid.uuid7(),
            room_id=room_id,
            author_id=author_id,
            text=text,
            sent_at=datetime.now(UTC),
        )


class ModerationResult(BaseModel):
    """What a moderator decided about a text."""

    model_config = ConfigDict(frozen=True)

    approved: bool
    reason: str | None = None


class ChatMessagePage(BaseModel):
    """One page of a room's history, newest first.

    ``next_cursor`` is the id of the last message of the page, or None when
    there are no older messages.
    """

    model_config = ConfigDict(frozen=True)

    messages: list[ChatMessage]
    next_cursor: uuid.UUID | None = None


class ChatRoomSummary(BaseModel):
    """A room of the list of a user, with its latest message if it has any."""

    model_config = ConfigDict(frozen=True)

    room: EventChatRoom
    last_message: ChatMessage | None = None
