"""Fan out a durable DM to the participants' internal channels."""

import asyncio
import json
import uuid
from typing import Protocol

from app.application.shared.error_codes import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import DirectMessage
from app.domain.realtime.models import Frame, FrameType, direct_user_channel


class CountedPublisher(Protocol):
    async def publish_counted(self, channel: str, message: str) -> int:
        """Publish and report subscribers at that instant."""
        ...


class DirectMessagePubSubBroadcaster:
    def __init__(self, pubsub: CountedPublisher, *, timeout_seconds: float) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self._pubsub = pubsub
        self._timeout_seconds = timeout_seconds

    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        data = message.model_dump(mode="json", exclude={"client_message_id"})
        frame = Frame(type=FrameType.DM_MESSAGE, payload=data)
        envelope = json.dumps(
            {"from": origin, "frame": frame.model_dump(mode="json", exclude_none=True)}
        )
        try:
            async with asyncio.timeout(self._timeout_seconds):
                recipients = await self._pubsub.publish_counted(
                    direct_user_channel(recipient_id), envelope
                )
                await self._pubsub.publish_counted(
                    direct_user_channel(message.sender_id), envelope
                )
        except TimeoutError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE) from exc
        return recipients
