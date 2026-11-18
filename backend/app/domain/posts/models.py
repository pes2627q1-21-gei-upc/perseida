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
from app.domain.shared.text import clean_user_text, has_visible_text


class PostAuthor(BaseModel):
    """The author of a community post.

    ``name`` is the profile name, or ``None`` when the account has none: the email
    is personal data and is never shown to the community (the app shows a generic
    name).
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    name: str | None


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
        cleaned = clean_user_text(value)
        if not has_visible_text(cleaned):
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
