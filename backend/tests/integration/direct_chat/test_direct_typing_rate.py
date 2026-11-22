"""TG-65: typing flood protection across sockets and separate from message quota."""

import os
from contextlib import ExitStack

import pytest

from tests.integration.chat.test_chat_ws import (
    RATE_LIMIT_MESSAGES,
    Harness,
    _environment as _environment,
    _preexisting_data_is_kept as _preexisting_data_is_kept,
    _schema_at_head as _schema_at_head,
    harness as harness,
    proxy as proxy,
)
from tests.integration.direct_chat.test_direct_ws import (
    assert_alive,
    dm_env as dm_env,
    open_conversation,
    receive_json,
    send_dm,
)

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)


def test_tg65_typing_flood_is_limited_per_user_across_connections(dm_env: Harness) -> None:
    dm_env.login("sender")
    dm_env.login("recipient")
    conversation_id = open_conversation(dm_env, "sender", "recipient")
    try:
        with ExitStack() as stack:
            first = dm_env.connect("sender", stack)
            second = dm_env.connect("sender", stack)
            recipient = dm_env.connect("recipient", stack)

            for index in range(RATE_LIMIT_MESSAGES):
                socket = first if index % 2 == 0 else second
                socket.send_json({"type": "dm.typing", "id": f"t{index}", "payload": {
                    "conversation_id": conversation_id, "is_typing": True,
                }})
                assert receive_json(recipient)["type"] == "dm.typing"

            first.send_json({"type": "dm.typing", "id": "overflow", "payload": {
                "conversation_id": conversation_id, "is_typing": True,
            }})
            error = receive_json(first)
            assert error["type"] == "error"
            assert error["id"] == "overflow"
            assert error["payload"]["code"] == "RATE_LIMITED"
            assert_alive(recipient)

            # Typing has its own counter: exhausting it does not consume the
            # separately configured allowance for durable chat messages.
            ack = send_dm(second, conversation_id, "hello", "message")
            assert ack["type"] == "dm.send"
            assert ack["id"] == "message"
    finally:
        dm_env.call(dm_env.direct.delete, f"ratelimit:dm-typing:{dm_env.users['sender']}")
