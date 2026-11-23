"""TG-65: independent ASGI lifespans sharing real PostgreSQL and Redis."""

import os
import queue
import time
import uuid
from collections.abc import Iterator
from contextlib import ExitStack
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.domain.direct_chat.models import DirectMessage
from app.domain.realtime.models import direct_user_channel
from app.infrastructure.direct_chat.push_notifier import NoopPushNotifier
from app.main import create_app
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
from tests.integration.direct_chat.test_direct_ws import (
    assert_alive,
    open_conversation,
    receive_json,
)
from tests.integration.direct_chat.test_direct_ws import (
    dm_env as dm_env,
)

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis required",
)


@pytest.fixture
def second_instance(dm_env: Harness) -> Iterator[Harness]:
    # Independent app state, lifespan, event loop and outbox worker; only the
    # Redis/PostgreSQL services and synthetic login credentials are shared.
    with TestClient(create_app()) as client:
        second = Harness(client, dm_env.proxy)
        second.tokens = dm_env.tokens
        second.users = dm_env.users
        try:
            yield second
        finally:
            second.call(second.direct.aclose)
            second.call(second.via_proxy.aclose)


def publish_frame(
    ws: Any, conversation: str, client_id: str, frame_id: str
) -> dict[str, Any]:
    ws.send_json(
        {
            "type": "dm.send",
            "id": frame_id,
            "payload": {
                "conversation_id": conversation,
                "text": "hello",
                "client_message_id": client_id,
            },
        }
    )
    return receive_json(ws)


def subscriber_count(env: Harness, user: str) -> int:
    channel = direct_user_channel(env.users[user])
    response = env.call(env.direct.pubsub_numsub, channel)
    return int(response[0][1])


def wait_delivered(message_id: str) -> None:
    deadline = time.monotonic() + 10
    while True:
        rows = sql(
            text(
                "SELECT delivered_at FROM direct_message_outbox WHERE message_id = :id"
            ),
            {"id": uuid.UUID(message_id)},
        )
        if rows and rows[0][0] is not None:
            return
        assert time.monotonic() < deadline, "outbox did not drain"
        time.sleep(0.02)


def test_tg65_two_instances_deliver_privately_and_retry_idempotently(
    dm_env: Harness, second_instance: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: queue.Queue[tuple[uuid.UUID, uuid.UUID]] = queue.Queue()
    original = NoopPushNotifier.notify

    async def observe(
        self: NoopPushNotifier, recipient: uuid.UUID, message: DirectMessage
    ) -> None:
        calls.put((recipient, message.id))
        await original(self, recipient, message)

    monkeypatch.setattr(NoopPushNotifier, "notify", observe)
    for name in ("sender", "recipient", "outsider"):
        dm_env.login(name)
    conversation = open_conversation(dm_env, "sender", "recipient")
    with ExitStack() as stack:
        sender = dm_env.connect("sender", stack)
        recipient1 = second_instance.connect("recipient", stack)
        recipient2 = second_instance.connect("recipient", stack)
        outsider = second_instance.connect("outsider", stack)
        assert subscriber_count(dm_env, "recipient") == 2
        key = str(uuid.uuid4())
        first = publish_frame(sender, conversation, key, "first")
        assert first["type"] == "dm.send"
        for socket in (recipient1, recipient2):
            received = receive_json(socket)
            assert received["type"] == "dm.message"
            assert received["payload"]["id"] == first["payload"]["id"]
        wait_delivered(first["payload"]["id"])
        # A repeated send is an idempotent retry, not a second delivery intent.
        retry = publish_frame(sender, conversation, key, "retry")
        assert retry["type"] == "dm.send"
        assert retry["payload"] == first["payload"]
        assert_alive(sender)
        assert_alive(recipient1)
        assert_alive(recipient2)
        assert_alive(outsider)
        assert calls.empty()


def test_tg65_remote_offline_recipient_triggers_noop_push(
    dm_env: Harness, second_instance: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: queue.Queue[tuple[uuid.UUID, uuid.UUID]] = queue.Queue()
    original = NoopPushNotifier.notify

    async def observe(
        self: NoopPushNotifier, recipient: uuid.UUID, message: DirectMessage
    ) -> None:
        calls.put((recipient, message.id))
        await original(self, recipient, message)

    monkeypatch.setattr(NoopPushNotifier, "notify", observe)
    dm_env.login("sender")
    dm_env.login("recipient")
    conversation = open_conversation(dm_env, "sender", "recipient")
    with ExitStack() as stack:
        sender = dm_env.connect("sender", stack)
        assert subscriber_count(dm_env, "recipient") == 0
        response = publish_frame(sender, conversation, str(uuid.uuid4()), "offline")
        assert response["type"] == "dm.send"
        assert calls.get(timeout=10) == (
            dm_env.users["recipient"],
            uuid.UUID(response["payload"]["id"]),
        )
        assert_alive(sender)
