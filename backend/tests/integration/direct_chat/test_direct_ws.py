"""TG-65 direct-message WebSocket integration contract.

Real PostgreSQL and Redis; the inherited event-chat harness runs the app's
lifespan, uses synthetic users, and tears down authentication state. The direct
chat rows are removed by the fixture below before the inherited teardown.
"""

import os
import queue
import threading
import uuid
from collections.abc import Iterator
from contextlib import ExitStack
from typing import Any

import pytest
from sqlalchemy import bindparam, text

from tests.integration.chat.test_chat_ws import (
    Harness,
    sql,
)
from tests.integration.chat.test_chat_ws import (
    _environment as _environment,
)
from tests.integration.chat.test_chat_ws import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.chat.test_chat_ws import (
    _schema_at_head as _schema_at_head,
)
from tests.integration.chat.test_chat_ws import (
    harness as harness,
)
from tests.integration.chat.test_chat_ws import (
    proxy as proxy,
)

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

DELETE_MESSAGES = text(
    "DELETE FROM direct_messages WHERE conversation_id IN "
    "(SELECT id FROM direct_conversations WHERE user_a_id IN :ids OR user_b_id IN :ids)"
).bindparams(bindparam("ids", expanding=True))
DELETE_CONVERSATIONS = text(
    "DELETE FROM direct_conversations WHERE user_a_id IN :ids OR user_b_id IN :ids"
).bindparams(bindparam("ids", expanding=True))
DELETE_BLOCKS = text(
    "DELETE FROM user_blocks WHERE blocker_id IN :ids OR blocked_id IN :ids"
).bindparams(bindparam("ids", expanding=True))


@pytest.fixture
def dm_env(harness: Harness) -> Iterator[Harness]:
    try:
        yield harness
    finally:
        if harness.users:
            params: dict[str, Any] = {"ids": list(harness.users.values())}
            sql(DELETE_MESSAGES, params)  # outbox rows cascade from messages
            sql(DELETE_CONVERSATIONS, params)
            sql(DELETE_BLOCKS, params)


def open_conversation(env: Harness, sender: str, recipient: str) -> str:
    response = env.client.post(
        "/api/direct-conversations",
        headers={"Authorization": f"Bearer {env.tokens[sender]}"},
        json={"user_id": str(env.users[recipient])},
    )
    assert response.status_code == 201
    return str(response.json()["id"])


def send_dm(ws: Any, conversation_id: str, body: str, frame_id: str) -> dict[str, Any]:
    ws.send_json(
        {
            "type": "dm.send",
            "id": frame_id,
            "payload": {
                "conversation_id": conversation_id,
                "text": body,
                "client_message_id": str(uuid.uuid4()),
            },
        }
    )
    return receive_json(ws)


def receive_json(ws: Any) -> dict[str, Any]:
    """Bound the wait for a frame so a broken delivery does not hang CI."""
    result: queue.Queue[tuple[dict[str, Any] | None, BaseException | None]] = (
        queue.Queue()
    )

    def receive() -> None:
        try:
            result.put((dict(ws.receive_json()), None))
        except BaseException as error:
            result.put((None, error))

    threading.Thread(target=receive, daemon=True).start()
    try:
        frame, error = result.get(timeout=10)
    except queue.Empty:
        pytest.fail("Timed out waiting for a WebSocket frame")
    if error is not None:
        raise error
    assert frame is not None
    return frame


def assert_alive(ws: Any) -> None:
    probe = uuid.uuid4().hex
    ws.send_json({"type": "ping", "id": probe})
    assert receive_json(ws) == {"type": "pong", "id": probe, "payload": {}}


def test_tg65_dm_send_ack_and_private_delivery_to_both_participants(
    dm_env: Harness,
) -> None:
    for user in ("sender", "recipient", "outsider"):
        dm_env.login(user)
    conversation_id = open_conversation(dm_env, "sender", "recipient")
    with ExitStack() as stack:
        sender = dm_env.connect("sender", stack)
        other_sender = dm_env.connect("sender", stack)
        recipient = dm_env.connect("recipient", stack)
        outsider = dm_env.connect("outsider", stack)

        ack = send_dm(sender, conversation_id, "hello", "m1")

        assert ack["type"] == "dm.send"
        assert ack["id"] == "m1"
        assert set(ack["payload"]) == {"id", "sent_at"}
        for socket in (recipient, other_sender):
            frame = receive_json(socket)
            assert frame["type"] == "dm.message"
            message = frame["payload"]
            assert message["id"] == ack["payload"]["id"]
            assert message["sent_at"] == ack["payload"]["sent_at"]
            assert message["conversation_id"] == conversation_id
            assert message["sender_id"] == str(dm_env.users["sender"])
            assert message["text"] == "hello"
        assert_alive(sender)
        assert_alive(outsider)


def test_tg65_dm_send_by_nonparticipant_is_not_found_and_not_delivered(
    dm_env: Harness,
) -> None:
    for user in ("sender", "recipient", "outsider"):
        dm_env.login(user)
    conversation_id = open_conversation(dm_env, "sender", "recipient")
    with ExitStack() as stack:
        recipient = dm_env.connect("recipient", stack)
        outsider = dm_env.connect("outsider", stack)
        error = send_dm(outsider, conversation_id, "intrusion", "bad")
        assert error["type"] == "error"
        assert error["id"] == "bad"
        assert error["payload"]["code"] == "CONVERSATION_NOT_FOUND"
        assert_alive(recipient)


def test_tg65_typing_is_ephemeral_and_private(dm_env: Harness) -> None:
    for user in ("sender", "recipient", "outsider"):
        dm_env.login(user)
    conversation_id = open_conversation(dm_env, "sender", "recipient")
    with ExitStack() as stack:
        sender = dm_env.connect("sender", stack)
        recipient = dm_env.connect("recipient", stack)
        outsider = dm_env.connect("outsider", stack)
        sender.send_json(
            {
                "type": "dm.typing",
                "payload": {
                    "conversation_id": conversation_id,
                    "is_typing": True,
                },
            }
        )
        frame = receive_json(recipient)
        assert frame["type"] == "dm.typing"
        assert frame["payload"]["conversation_id"] == conversation_id
        assert frame["payload"]["is_typing"] is True
        assert_alive(outsider)
    history = dm_env.client.get(
        f"/api/direct-conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {dm_env.tokens['recipient']}"},
    )
    assert history.status_code == 200
    assert history.json()["messages"] == []


@pytest.mark.parametrize("is_blocked", [False, True], ids=["outsider", "blocked"])
def test_tg65_typing_denied_for_outsider_or_blocked_user(
    dm_env: Harness, is_blocked: bool
) -> None:
    for user in ("sender", "recipient", "outsider"):
        dm_env.login(user)
    conversation_id = open_conversation(dm_env, "sender", "recipient")
    actor = "sender" if is_blocked else "outsider"
    if is_blocked:
        response = dm_env.client.put(
            f"/api/users/{dm_env.users['sender']}/block",
            headers={"Authorization": f"Bearer {dm_env.tokens['recipient']}"},
        )
        assert response.status_code == 204
    with ExitStack() as stack:
        listener = dm_env.connect("recipient", stack)
        socket = dm_env.connect(actor, stack)
        socket.send_json(
            {
                "type": "dm.typing",
                "id": "t1",
                "payload": {
                    "conversation_id": conversation_id,
                    "is_typing": True,
                },
            }
        )
        error = receive_json(socket)
        assert error["type"] == "error"
        assert error["id"] == "t1"
        assert error["payload"]["code"] == (
            "USER_BLOCKED" if is_blocked else "CONVERSATION_NOT_FOUND"
        )
        assert_alive(listener)
