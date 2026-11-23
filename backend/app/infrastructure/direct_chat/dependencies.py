"""Dependencies for the direct chat REST endpoints."""

import uuid
from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.direct_chat.direct_chat_service import DirectChatService
from app.application.shared.error_codes import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import DirectMessage
from app.infrastructure.chat.dependencies import ChatSettingsDep
from app.infrastructure.chat.moderator import ApproveAllModerator
from app.infrastructure.chat.rate_limiter import RedisSendRateLimiter
from app.infrastructure.direct_chat.push_notifier import NoopPushNotifier
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
    SqlUserBlockRepository,
)
from app.infrastructure.direct_chat.user_directory import SqlChatUserDirectory


class _UnavailableBroadcaster:
    """REST never sends; replace this with the WS adapter before exposing sends."""

    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        raise ExternalServiceError(PUBSUB_UNAVAILABLE)


def get_direct_chat_service(
    conn: HTTPConnection, settings: ChatSettingsDep
) -> DirectChatService:
    state = conn.app.state
    factory = state.session_factory
    return DirectChatService(
        SqlDirectConversationRepository(factory),
        SqlDirectMessageRepository(factory),
        SqlUserBlockRepository(factory),
        SqlChatUserDirectory(factory),
        RedisSendRateLimiter(
            state.redis,
            settings.chat_rate_limit_messages,
            settings.chat_rate_limit_window_seconds,
        ),
        ApproveAllModerator(),
        _UnavailableBroadcaster(),
        NoopPushNotifier(),
    )


DirectChatServiceDep = Annotated[DirectChatService, Depends(get_direct_chat_service)]
