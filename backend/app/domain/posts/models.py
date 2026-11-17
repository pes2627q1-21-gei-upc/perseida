import re
import unicodedata
import uuid
from datetime import UTC, datetime
from typing import Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, field_validator

from app.domain.posts.errors import (
    POST_MAX_LENGTH,
    POST_TEXT_EMPTY,
    POST_TEXT_TOO_LONG,
)
from app.domain.shared.errors import ValidationError

# Control characters and surrogates (NUL would make PostgreSQL fail), plus line
# and paragraph separators.
_DROPPED_CATEGORIES = ("Cc", "Cs", "Zl", "Zp")
_KEPT_CHARACTERS = "\n\t"

# Dangerous invisible / spoofing code points (ADR-0024)
_DANGEROUS_RANGES = (
    (0x00AD, 0x00AD),  # soft hyphen
    (0x034F, 0x034F),  # combining grapheme joiner
    (0x115F, 0x1160),  # hangul fillers
    (0x17B4, 0x17B5),  # khmer inherent vowels
    (0x180B, 0x180F),  # mongolian variation selectors and vowel separator
    (0x200B, 0x200B),  # zero-width space
    (0x2028, 0x202E),  # line/paragraph separators, bidi embeddings and overrides
    (0x2060, 0x206F),  # word joiner, invisible operators, bidi isolates
    (0x3164, 0x3164),  # hangul filler
    (0xFE00, 0xFE0D),  # variation selectors
    (0xFEFF, 0xFEFF),  # zero-width no-break space
    (0xFFA0, 0xFFA0),  # halfwidth hangul filler
    (0xFFF0, 0xFFF8),  # reserved default ignorable
    (0x1BCA0, 0x1BCA3),  # shorthand format controls
    (0x1D173, 0x1D17A),  # musical format controls
    (0xE0000, 0xE0FFF),  # tags, reserved and ideographic variation selectors
)
_FLAG_SUBDIVISIONS = ("gbeng", "gbsct", "gbwls")


def _flag(subdivision: str) -> str:
    tags = "".join(chr(0xE0000 + ord(letter)) for letter in subdivision)
    return chr(0x1F3F4) + tags + chr(0xE007F)


def _character_class(ranges: tuple[tuple[int, int], ...]) -> str:
    return "".join(
        f"{re.escape(chr(low))}-{re.escape(chr(high))}" for low, high in ranges
    )


_DANGEROUS_OR_FLAG = re.compile(
    "(?P<flag>"
    + "|".join(re.escape(_flag(subdivision)) for subdivision in _FLAG_SUBDIVISIONS)
    + ")|["
    + _character_class(_DANGEROUS_RANGES)
    + "]"
)
_INVISIBLE_MARKS = "\u200c\u200d\u200e\u200f\u061c\ufe0e\ufe0f\u2800"


def _clean_post_text(value: str) -> str:
    """Drop dangerous invisible and control characters and surrounding blanks."""
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
    return bool(value.translate(str.maketrans("", "", _INVISIBLE_MARKS)).strip())


class PostAuthor(BaseModel):
    """The author of a community post."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    name: str


class Post(BaseModel):
    """A text publication created by a user under an astronomical event."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    event_id: uuid.UUID
    author: PostAuthor
    text: str
    created_at: AwareDatetime
    edited_at: AwareDatetime | None = None

    @field_validator("text")
    @classmethod
    def _validate_text(cls, value: str) -> str:
        cleaned = _clean_post_text(value)
        if not _has_visible_text(cleaned):
            raise ValidationError(POST_TEXT_EMPTY, "Post text must not be empty")
        if len(cleaned) > POST_MAX_LENGTH:
            raise ValidationError(
                POST_TEXT_TOO_LONG,
                f"Post text must have at most {POST_MAX_LENGTH} characters",
            )
        return cleaned

    @classmethod
    def create(
        cls,
        *,
        event_id: uuid.UUID,
        author: PostAuthor,
        text: str,
        id: uuid.UUID | None = None,
        now: AwareDatetime | None = None,
    ) -> Self:
        """Create a new post instance with generated UUIDv7 and UTC timestamp."""
        return cls(
            id=id or uuid.uuid7(),
            event_id=event_id,
            author=author,
            text=text,
            created_at=now or datetime.now(UTC),
            edited_at=None,
        )

    def edit(self, new_text: str, *, edited_at: AwareDatetime | None = None) -> Self:
        """Return a copy with updated text and edited_at timestamp."""
        return self.__class__(
            id=self.id,
            event_id=self.event_id,
            author=self.author,
            text=new_text,
            created_at=self.created_at,
            edited_at=edited_at or datetime.now(UTC),
        )


class PostCursor(BaseModel):
    """Exclusive position cursor for pagination, ordered by created_at desc, id desc."""

    model_config = ConfigDict(frozen=True)

    created_at: AwareDatetime
    id: uuid.UUID


class PostRepositoryPage(BaseModel):
    """A paginated page of event posts."""

    model_config = ConfigDict(frozen=True)

    posts: list[Post]
    next_cursor: PostCursor | None = None
