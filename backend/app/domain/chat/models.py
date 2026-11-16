import re
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

# Control characters and surrogates (NUL would make PostgreSQL fail), plus the line
# and paragraph separators, which are not control characters but break lines.
_DROPPED_CATEGORIES = ("Cc", "Cs", "Zl", "Zp")
# Newline and tab are kept because a chat has them.
_KEPT_CHARACTERS = "\n\t"

# Default_Ignorable_Code_Point (Unicode 18, DerivedCoreProperties.txt) that is
# dangerous: invisible code points that hide or spoof text (bidi overrides and
# isolates, zero-width and tag characters, fillers...). Only these are dropped, so
# unassigned code points (an emoji newer than Python's Unicode) are kept.
# Kept on purpose, although default ignorable: ZWJ and ZWNJ (composed emoji and
# some scripts), LRM, RLM and ALM (single directional marks) and the emoji
# variation selectors FE0E and FE0F.
_DANGEROUS_RANGES = (
    (0x00AD, 0x00AD),  # soft hyphen
    (0x034F, 0x034F),  # combining grapheme joiner
    (0x115F, 0x1160),  # hangul fillers
    (0x17B4, 0x17B5),  # khmer inherent vowels
    (0x180B, 0x180F),  # mongolian variation selectors and vowel separator
    (0x200B, 0x200B),  # zero-width space
    (0x2028, 0x202E),  # line/paragraph separators, bidi embeddings and overrides
    (0x2060, 0x206F),  # word joiner, invisible operators, bidi isolates, obsolete
    (0x3164, 0x3164),  # hangul filler
    (0xFE00, 0xFE0D),  # variation selectors (not the emoji ones)
    (0xFEFF, 0xFEFF),  # zero-width no-break space
    (0xFFA0, 0xFFA0),  # halfwidth hangul filler
    (0xFFF0, 0xFFF8),  # reserved default ignorable
    (0x1BCA0, 0x1BCA3),  # shorthand format controls
    (0x1D173, 0x1D17A),  # musical format controls
    (0xE0000, 0xE0FFF),  # tags, reserved and ideographic variation selectors
)
# The only tag sequences kept: the RGI subdivision flags of England, Scotland and
# Wales. Tag characters can encode hidden ASCII, so any other one is dropped.
_FLAG_SUBDIVISIONS = ("gbeng", "gbsct", "gbwls")


def _flag(subdivision: str) -> str:
    tags = "".join(chr(0xE0000 + ord(letter)) for letter in subdivision)
    return chr(0x1F3F4) + tags + chr(0xE007F)


def _character_class(ranges: tuple[tuple[int, int], ...]) -> str:
    return "".join(
        f"{re.escape(chr(low))}-{re.escape(chr(high))}" for low, high in ranges
    )


# A known flag matches first and is kept; any other dangerous character is dropped.
_DANGEROUS_OR_FLAG = re.compile(
    "(?P<flag>"
    + "|".join(re.escape(_flag(subdivision)) for subdivision in _FLAG_SUBDIVISIONS)
    + ")|["
    + _character_class(_DANGEROUS_RANGES)
    + "]"
)
# Not visible by themselves: a text with only these (and blanks) is empty. The
# braille blank is not default ignorable but draws nothing.
_INVISIBLE_MARKS = "\u200c\u200d\u200e\u200f\u061c\ufe0e\ufe0f\u2800"


def _clean_message_text(value: str) -> str:
    """Drop dangerous invisible and control characters and surrounding blanks.

    Never truncates.
    """
    without_invisibles = _DANGEROUS_OR_FLAG.sub(
        lambda match: match.group("flag") or "", value
    )
    kept = "".join(
        char
        for char in without_invisibles
        if char in _KEPT_CHARACTERS
        or unicodedata.category(char) not in _DROPPED_CATEGORIES
    )
    return kept.strip()


def _has_visible_text(value: str) -> bool:
    """Whether ``value`` is more than blanks and invisible marks."""
    return bool(value.translate(str.maketrans("", "", _INVISIBLE_MARKS)).strip())


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
