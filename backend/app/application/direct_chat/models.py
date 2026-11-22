"""Read models returned by the direct chat use cases."""

import uuid

from pydantic import AwareDatetime, BaseModel, ConfigDict

from app.domain.direct_chat.models import DirectMessage


class ConversationOverview(BaseModel):
    """One row of the conversation list of a user."""

    model_config = ConfigDict(frozen=True)

    conversation_id: uuid.UUID
    other_user_id: uuid.UUID
    other_display_name: str | None = None
    other_avatar_url: str | None = None
    last_message_preview: str | None
    last_message_at: AwareDatetime | None
    last_message_sender_id: uuid.UUID | None
    unread_count: int
    blocked_by_me: bool
    created_at: AwareDatetime


class DirectHistoryPage(BaseModel):
    """A page of history, newest first; ``next_cursor`` is None at the end."""

    model_config = ConfigDict(frozen=True)

    items: list[DirectMessage]
    next_cursor: str | None = None
