"""TG-65: one deadline covers the complete DM fan-out."""

import asyncio
import uuid

import pytest

from app.application.shared.error_codes import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import DirectMessage
from app.infrastructure.direct_chat.broadcaster import DirectMessagePubSubBroadcaster


class StagedPublisher:
    def __init__(self) -> None:
        self.calls = 0
        self.release_first = asyncio.Event()
        self.never = asyncio.Event()

    async def publish_counted(self, channel: str, message: str) -> int:
        self.calls += 1
        if self.calls == 1:
            await self.release_first.wait()
            return 1
        await self.never.wait()
        return 1


async def test_tg65_timeout_budget_is_shared_by_both_publishes() -> None:
    publisher = StagedPublisher()
    broadcaster = DirectMessagePubSubBroadcaster(publisher, timeout_seconds=0.5)
    message = DirectMessage.create(
        conversation_id=uuid.uuid7(),
        sender_id=uuid.uuid7(),
        text="hello",
        client_message_id=uuid.uuid4(),
    )
    # The first publish spends most of the total budget; the outer bound is
    # longer than one deadline but shorter than two independent deadlines.
    timer = asyncio.get_running_loop().call_later(0.4, publisher.release_first.set)
    try:
        with pytest.raises(ExternalServiceError) as error:
            await asyncio.wait_for(
                broadcaster.deliver(message, recipient_id=uuid.uuid7(), origin=None),
                timeout=0.8,
            )
    finally:
        timer.cancel()
    assert error.value.code == PUBSUB_UNAVAILABLE
    assert publisher.calls == 2
