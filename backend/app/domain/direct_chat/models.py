import uuid
from datetime import UTC, datetime
from typing import Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    field_validator,
    model_validator,
)

from app.domain.direct_chat.errors import (
    CANNOT_MESSAGE_SELF,
    MESSAGE_MAX_LENGTH,
    NOT_A_PARTICIPANT,
    VALIDATION_ERROR,
)
from app.domain.shared.errors import BusinessRuleViolation, ValidationError
from app.domain.shared.text import clean_user_text, has_visible_text


class DirectConversation(BaseModel):
    """The conversation of two users: one per pair, whatever the order they are given.

    The pair is stored ordered (``user_a_id < user_b_id``) so a pair has one key.
    Each participant has a read mark: messages of the other sent after it are unread.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    user_a_id: uuid.UUID
    user_b_id: uuid.UUID
    created_at: AwareDatetime
    user_a_read_at: AwareDatetime | None = None
    user_b_read_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def _check_pair(self) -> Self:
        if self.user_a_id == self.user_b_id:
            raise BusinessRuleViolation(
                CANNOT_MESSAGE_SELF, "A user cannot talk to themselves"
            )
        if self.user_a_id > self.user_b_id:
            raise BusinessRuleViolation(
                VALIDATION_ERROR, "The pair of users must be ordered"
            )
        return self

    @classmethod
    def create(cls, user_1_id: uuid.UUID, user_2_id: uuid.UUID) -> DirectConversation:
        """Open the conversation of two users, in any order.

        Raises:
            BusinessRuleViolation: CANNOT_MESSAGE_SELF if both are the same user.
        """
        low, high = sorted((user_1_id, user_2_id))
        return cls(
            id=uuid.uuid7(),
            user_a_id=low,
            user_b_id=high,
            created_at=datetime.now(UTC),
        )

    def has_participant(self, user_id: uuid.UUID) -> bool:
        """Whether ``user_id`` is one of the two participants."""
        return user_id in (self.user_a_id, self.user_b_id)

    def other_participant(self, user_id: uuid.UUID) -> uuid.UUID:
        """Return the participant that is not ``user_id``.

        Raises:
            BusinessRuleViolation: NOT_A_PARTICIPANT if ``user_id`` is a stranger.
        """
        self._require_participant(user_id)
        return self.user_b_id if user_id == self.user_a_id else self.user_a_id

    def mark_read(self, user_id: uuid.UUID, at: datetime) -> DirectConversation:
        """Return a copy with the read mark of ``user_id`` moved to ``at``.

        The mark never goes backwards: an earlier ``at`` keeps the current one.

        Raises:
            BusinessRuleViolation: NOT_A_PARTICIPANT if ``user_id`` is a stranger.
            ValidationError: VALIDATION_ERROR if ``at`` has no time zone.
        """
        self._require_participant(user_id)
        # model_copy does not validate, so a naive ``at`` would get in unchecked.
        if at.tzinfo is None or at.utcoffset() is None:
            raise ValidationError(
                VALIDATION_ERROR, "The read time must have a time zone"
            )
        field = "user_a_read_at" if user_id == self.user_a_id else "user_b_read_at"
        current: datetime | None = getattr(self, field)
        if current is not None and current >= at:
            return self.model_copy()
        return self.model_copy(update={field: at})

    def is_unread_for(self, user_id: uuid.UUID, message: DirectMessage) -> bool:
        """Whether ``message`` is unread for ``user_id``.

        Raises:
            BusinessRuleViolation: NOT_A_PARTICIPANT if ``user_id`` is a stranger.
        """
        self._require_participant(user_id)
        if message.sender_id == user_id:
            return False
        mark = self.user_a_read_at if user_id == self.user_a_id else self.user_b_read_at
        return mark is None or message.sent_at > mark

    def _require_participant(self, user_id: uuid.UUID) -> None:
        if not self.has_participant(user_id):
            raise BusinessRuleViolation(
                NOT_A_PARTICIPANT, "The user is not in the conversation"
            )


class DirectMessage(BaseModel):
    """A text message of a direct conversation. Messages are never edited."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    text: str
    sent_at: AwareDatetime
    # Idempotency key chosen by the sender: unique per sender, so a retry of the
    # same send never stores a second message.
    client_message_id: uuid.UUID

    @field_validator("text")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        cleaned = clean_user_text(value)
        if not has_visible_text(cleaned):
            raise ValidationError(VALIDATION_ERROR, "Message must not be empty")
        if len(cleaned) > MESSAGE_MAX_LENGTH:
            raise ValidationError(
                VALIDATION_ERROR,
                f"Message must have at most {MESSAGE_MAX_LENGTH} characters",
            )
        return cleaned

    @classmethod
    def create(
        cls,
        *,
        conversation_id: uuid.UUID,
        sender_id: uuid.UUID,
        text: str,
        client_message_id: uuid.UUID,
    ) -> DirectMessage:
        """Build a new message; the server sets its id and ``sent_at``."""
        return cls(
            id=uuid.uuid7(),
            conversation_id=conversation_id,
            sender_id=sender_id,
            text=text,
            sent_at=datetime.now(UTC),
            client_message_id=client_message_id,
        )


class UserBlock(BaseModel):
    """``blocker_id`` does not want messages from ``blocked_id`` (directional)."""

    model_config = ConfigDict(frozen=True)

    blocker_id: uuid.UUID
    blocked_id: uuid.UUID
    created_at: AwareDatetime

    @model_validator(mode="after")
    def _check_users(self) -> Self:
        if self.blocker_id == self.blocked_id:
            raise BusinessRuleViolation(
                CANNOT_MESSAGE_SELF, "A user cannot block themselves"
            )
        return self

    @classmethod
    def create(cls, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> UserBlock:
        """Block ``blocked_id`` for ``blocker_id``.

        Raises:
            BusinessRuleViolation: CANNOT_MESSAGE_SELF if both are the same user.
        """
        return cls(
            blocker_id=blocker_id,
            blocked_id=blocked_id,
            created_at=datetime.now(UTC),
        )


class DirectCursor(BaseModel):
    """Exclusive history position, ordered by timestamp and id."""

    model_config = ConfigDict(frozen=True)

    sent_at: AwareDatetime
    id: uuid.UUID


class DirectMessagePage(BaseModel):
    """One page of a conversation's history, newest first.

    ``next_cursor`` is None when there are no older messages.
    """

    model_config = ConfigDict(frozen=True)

    messages: list[DirectMessage]
    next_cursor: DirectCursor | None = None
