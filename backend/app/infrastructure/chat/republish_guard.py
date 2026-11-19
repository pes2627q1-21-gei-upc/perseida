import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.application.chat.chat_service import REPUBLISH_COOLDOWN_SECONDS
from app.application.realtime.errors import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError


class RedisRepublishGuard:
    """Per-message marks that expire after the cooldown, shared across workers."""

    def __init__(
        self, redis: Redis, cooldown_seconds: int = REPUBLISH_COOLDOWN_SECONDS
    ) -> None:
        if cooldown_seconds < 1:
            raise ValueError("cooldown must be positive")
        self._redis = redis
        self._cooldown_seconds = cooldown_seconds

    @staticmethod
    def _key(author_id: uuid.UUID, client_message_id: uuid.UUID) -> str:
        return f"chat:republished:{author_id}:{client_message_id}"

    async def was_published_recently(
        self, author_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> bool:
        try:
            return bool(
                await self._redis.exists(self._key(author_id, client_message_id))
            )
        except RedisError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE) from exc

    async def mark_published(
        self, author_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> None:
        try:
            await self._redis.set(
                self._key(author_id, client_message_id),
                1,
                ex=self._cooldown_seconds,
            )
        except RedisError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE) from exc
