"""Direct-message frames, authorized using the authenticated session."""

import json
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.application.direct_chat.direct_chat_service import DirectChatService
from app.application.shared.error_codes import RATE_LIMITED
from app.application.shared.errors import ForbiddenError, RateLimitedError
from app.application.users.user_service import UserService
from app.domain.direct_chat.errors import (
    CONVERSATION_NOT_FOUND,
    USER_BLOCKED,
    VALIDATION_ERROR,
)
from app.domain.realtime.models import Frame, FrameType, direct_user_channel
from app.domain.shared.errors import NotFoundError, ValidationError
from app.domain.shared.ports import PubSub, SendRateLimiter
from app.infrastructure.direct_chat.repository import lock_pair
from app.infrastructure.direct_chat.tables import DirectConversationRow, UserBlockRow
from app.infrastructure.persistence.errors import database_errors


def _uuid(payload: dict[str, Any], name: str) -> uuid.UUID:
    value = payload.get(name)
    if not isinstance(value, str):
        raise ValidationError(VALIDATION_ERROR, "Invalid identifier.")
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        raise ValidationError(VALIDATION_ERROR, "Invalid identifier.") from None
    if str(parsed) != value:
        raise ValidationError(VALIDATION_ERROR, "Invalid identifier.")
    return parsed


class DirectWsHandler:
    def __init__(
        self,
        service: Callable[[], DirectChatService],
        users: Callable[[], UserService],
        factory: async_sessionmaker[AsyncSession],
        pubsub: PubSub,
        typing_limiter: SendRateLimiter,
    ) -> None:
        self._service = service
        self._users = users
        self._factory = factory
        self._pubsub = pubsub
        self._typing_limiter = typing_limiter
        self._authenticated_sub: str | None = None
        self._authenticated_id: uuid.UUID | None = None

    async def user_id(self, sub: str) -> uuid.UUID:
        user_id = (await self._users().get_profile(sub)).id
        self._authenticated_sub = sub
        self._authenticated_id = user_id
        return user_id

    async def send(
        self, sub: str, connection_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        conversation_id = _uuid(payload, "conversation_id")
        client_id = _uuid(payload, "client_message_id")
        text = payload.get("text")
        if not isinstance(text, str):
            raise ValidationError(VALIDATION_ERROR, "The message needs a text.")
        sender = await self.user_id(sub)
        message = await self._service().send_message(
            sender,
            conversation_id,
            text,
            client_message_id=client_id,
            origin=connection_id,
        )
        return {
            "id": str(message.id),
            "sent_at": message.model_dump(mode="json")["sent_at"],
        }

    async def typing(self, sub: str, payload: dict[str, Any]) -> None:
        conversation_id = _uuid(payload, "conversation_id")
        typing = payload.get("is_typing")
        if not isinstance(typing, bool):
            raise ValidationError(VALIDATION_ERROR, "Invalid typing state.")
        # This handler belongs to one authenticated WebSocket. The session
        # resolves its profile at handshake; never derive the key from a frame.
        if self._authenticated_sub == sub and self._authenticated_id is not None:
            authenticated_id = self._authenticated_id
        else:
            authenticated_id = await self.user_id(sub)
        if not await self._typing_limiter.hit(authenticated_id):
            raise RateLimitedError(RATE_LIMITED)
        # Recheck account state before processing an admitted typing frame.
        sender = await self.user_id(sub)
        with database_errors():
            async with self._factory() as session, session.begin():
                conversation = await session.get(DirectConversationRow, conversation_id)
                if conversation is None or sender not in (
                    conversation.user_a_id,
                    conversation.user_b_id,
                ):
                    raise NotFoundError(
                        CONVERSATION_NOT_FOUND, "The conversation does not exist"
                    )
                a, b = conversation.user_a_id, conversation.user_b_id
                await lock_pair(session, a, b)
                blocked = await session.scalar(
                    select(
                        exists().where(
                            or_(
                                (col(UserBlockRow.blocker_id) == a)
                                & (col(UserBlockRow.blocked_id) == b),
                                (col(UserBlockRow.blocker_id) == b)
                                & (col(UserBlockRow.blocked_id) == a),
                            )
                        )
                    )
                )
                if blocked:
                    raise ForbiddenError(USER_BLOCKED, "The conversation is blocked")
                recipient = b if sender == a else a
                frame = Frame(
                    type=FrameType.DM_TYPING,
                    payload={
                        "conversation_id": str(conversation_id),
                        "is_typing": typing,
                    },
                )
                envelope = {
                    "from": None,
                    "frame": frame.model_dump(mode="json", exclude_none=True),
                }
                await self._pubsub.publish(
                    direct_user_channel(recipient), json.dumps(envelope)
                )
