"""TG-65: sending acknowledges durable acceptance, not synchronous delivery."""

import uuid

from app.application.direct_chat.direct_chat_service import DirectChatService
from tests.fakes.direct_chat import DirectChatHarness
from tests.unit.application.direct_chat.test_direct_chat_service import (
    ALICE,
    BOB,
    _conversation,
)
from tests.unit.application.direct_chat.test_direct_chat_service import (
    env as env,
)
from tests.unit.application.direct_chat.test_direct_chat_service import (
    service as service,
)


async def test_tg65_send_accepts_durably_without_publishing_inline(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    env.broadcaster.fail = True

    message = await service.send_message(
        ALICE, conversation.id, "hello", client_message_id=uuid.uuid4()
    )

    assert env.messages.messages == [message]
    assert env.broadcaster.calls == []
    assert env.push.sent == []
    assert conversation.other_participant(ALICE) == BOB
