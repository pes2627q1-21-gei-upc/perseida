from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.chat.chat_service import ChatService
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.chat.config import ChatSettings
from app.infrastructure.chat.moderator import ApproveAllModerator
from app.infrastructure.chat.rate_limiter import RedisSendRateLimiter
from app.infrastructure.chat.repository import SqlChatRepository
from app.infrastructure.events.subscription_repository import (
    SqlEventSubscriptionRepository,
)


@lru_cache
def get_chat_settings() -> ChatSettings:
    return ChatSettings()


ChatSettingsDep = Annotated[ChatSettings, Depends(get_chat_settings)]


def get_chat_service(conn: HTTPConnection, settings: ChatSettingsDep) -> ChatService:
    # Light objects over the lifespan resources (session factory, Redis).
    state = conn.app.state
    return ChatService(
        SqlChatRepository(state.session_factory),
        SqlEventSubscriptionRepository(state.session_factory),
        RedisSendRateLimiter(
            state.redis,
            settings.chat_rate_limit_messages,
            settings.chat_rate_limit_window_seconds,
        ),
        ApproveAllModerator(),
        RedisPubSub(state.redis),
        message_max_length=settings.chat_message_max_length,
    )


ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
