"""Public direct-chat REST schemas."""

import uuid

from pydantic import AwareDatetime, BaseModel


class OpenDirectConversationRequest(BaseModel):
    user_id: uuid.UUID


class DirectConversationResponse(BaseModel):
    id: uuid.UUID
    user_a_id: uuid.UUID
    user_b_id: uuid.UUID
    created_at: AwareDatetime


class DirectMessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    text: str
    sent_at: AwareDatetime


class DirectHistoryResponse(BaseModel):
    messages: list[DirectMessageResponse]
    next_cursor: str | None
