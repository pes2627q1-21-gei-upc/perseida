"""TG-65 REST behaviour against PostgreSQL and Redis (red before router)."""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from tests.integration.chat.test_chat_api import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.chat.test_chat_api import _schema_at_head as _schema_at_head
from tests.integration.chat.test_chat_api import app as app
from tests.integration.chat.test_chat_api import (
    assert_problem,
    login_headers,
    user_id_of,
)
from tests.integration.chat.test_chat_api import client as client
from tests.integration.chat.test_chat_api import connection as connection
from tests.integration.chat.test_chat_api import factory as factory
from tests.integration.chat.test_chat_api import google_certs as google_certs

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

ROOT = "/api/direct-conversations"
NOW = datetime(2026, 11, 20, tzinfo=UTC)


async def open_conversation(
    client: AsyncClient, headers: dict[str, str], other: uuid.UUID
) -> str:
    response = await client.post(ROOT, headers=headers, json={"user_id": str(other)})
    assert response.status_code == 201
    return str(response.json()["id"])


async def seed_message(
    connection: AsyncConnection,
    conversation: str,
    sender: uuid.UUID,
    sent_at: datetime,
    body: str,
) -> str:
    message_id = uuid.uuid7()
    await connection.execute(
        text(
            "INSERT INTO direct_messages "
            "(id, conversation_id, sender_id, client_message_id, text, sent_at) "
            "VALUES (:id, :conversation, :sender, :client_id, :body, :sent_at)"
        ),
        {
            "id": message_id,
            "conversation": uuid.UUID(conversation),
            "sender": sender,
            "client_id": uuid.uuid4(),
            "body": body,
            "sent_at": sent_at,
        },
    )
    return str(message_id)


async def test_tg65_open_is_idempotent_in_both_participant_orders(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    ana_id = await user_id_of(client, ana)
    bob_id = await user_id_of(client, bob)
    first = await client.post(ROOT, headers=ana, json={"user_id": str(bob_id)})
    second = await client.post(ROOT, headers=bob, json={"user_id": str(ana_id)})
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    count = await connection.scalar(
        text("SELECT count(*) FROM direct_conversations WHERE id = :id"),
        {"id": uuid.UUID(first.json()["id"])},
    )
    assert count == 1


async def test_tg65_list_contains_only_conversations_of_current_user(
    client: AsyncClient,
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    other = await login_headers(client)
    assert (await client.get(ROOT, headers=other)).json() == []
    mine = await open_conversation(client, ana, await user_id_of(client, bob))
    theirs = await open_conversation(client, bob, await user_id_of(client, other))
    response = await client.get(ROOT, headers=ana)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert mine in str(response.json())
    assert theirs not in str(response.json())


@pytest.mark.parametrize("target", ["unknown", "deleted", "self"])
async def test_tg65_open_rejects_invalid_other_user(
    client: AsyncClient, connection: AsyncConnection, target: str
) -> None:
    headers = await login_headers(client)
    if target == "self":
        other = await user_id_of(client, headers)
    elif target == "unknown":
        other = uuid.uuid7()
    else:
        other = await user_id_of(client, await login_headers(client))
        await connection.execute(
            text("UPDATE users SET deleted_at = now() WHERE id = :id"), {"id": other}
        )
    response = await client.post(ROOT, headers=headers, json={"user_id": str(other)})
    expected = (
        (422, "CANNOT_MESSAGE_SELF") if target == "self" else (404, "USER_NOT_FOUND")
    )
    assert_problem(response, *expected)


async def test_tg65_history_cursor_is_exclusive_and_contains_all_messages(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana, bob = await login_headers(client), await login_headers(client)
    bob_id = await user_id_of(client, bob)
    conversation = await open_conversation(client, ana, bob_id)
    expected = [
        await seed_message(
            connection, conversation, bob_id, NOW + timedelta(seconds=i), f"m{i}"
        )
        for i in range(55)
    ]
    path = f"{ROOT}/{conversation}/messages"
    first = await client.get(path, headers=ana)
    assert first.status_code == 200
    body = first.json()
    assert [m["id"] for m in body["messages"]] == list(reversed(expected))[:50]
    assert body["next_cursor"]
    second = await client.get(path, headers=ana, params={"before": body["next_cursor"]})
    assert second.status_code == 200
    assert [m["id"] for m in second.json()["messages"]] == list(reversed(expected))[50:]
    assert second.json()["next_cursor"] is None


@pytest.mark.parametrize("action", ["messages", "read"])
async def test_tg65_strangers_cannot_view_or_mark_a_conversation(
    client: AsyncClient, action: str
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    stranger = await login_headers(client)
    conversation = await open_conversation(client, ana, await user_id_of(client, bob))
    response = await client.request(
        "GET" if action == "messages" else "POST",
        f"{ROOT}/{conversation}/{action}",
        headers=stranger,
    )
    assert_problem(response, 404, "CONVERSATION_NOT_FOUND")


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 51}, {"before": "bad"}])
async def test_tg65_invalid_history_pagination_is_a_problem(
    client: AsyncClient, params: dict[str, object]
) -> None:
    ana, bob = await login_headers(client), await login_headers(client)
    conversation = await open_conversation(client, ana, await user_id_of(client, bob))
    response = await client.get(
        f"{ROOT}/{conversation}/messages", headers=ana, params=params
    )
    assert_problem(response, 422, "VALIDATION_ERROR")


async def test_tg65_read_updates_only_the_authenticated_participants_mark(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana, bob = await login_headers(client), await login_headers(client)
    ana_id, bob_id = await user_id_of(client, ana), await user_id_of(client, bob)
    conversation = await open_conversation(client, ana, bob_id)
    response = await client.post(f"{ROOT}/{conversation}/read", headers=ana)
    assert 200 <= response.status_code < 300
    row = (
        await connection.execute(
            text(
                "SELECT user_a_id, user_a_read_at, user_b_read_at "
                "FROM direct_conversations WHERE id = :id"
            ),
            {"id": uuid.UUID(conversation)},
        )
    ).one()
    my_mark, other_mark = (row[1], row[2]) if row[0] == ana_id else (row[2], row[1])
    assert my_mark is not None
    assert other_mark is None


async def test_tg65_block_and_unblock_are_idempotent_and_keep_history(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana, bob = await login_headers(client), await login_headers(client)
    ana_id, bob_id = await user_id_of(client, ana), await user_id_of(client, bob)
    conversation = await open_conversation(client, ana, bob_id)
    message = await seed_message(connection, conversation, bob_id, NOW, "Hola")
    path = f"/api/users/{bob_id}/block"
    for _ in range(2):
        response = await client.put(path, headers=ana)
        assert 200 <= response.status_code < 300
    count = await connection.scalar(
        text("SELECT count(*) FROM user_blocks WHERE blocker_id=:a AND blocked_id=:b"),
        {"a": ana_id, "b": bob_id},
    )
    assert count == 1
    history = await client.get(f"{ROOT}/{conversation}/messages", headers=ana)
    assert history.status_code == 200
    assert [item["id"] for item in history.json()["messages"]] == [message]
    for _ in range(2):
        response = await client.delete(path, headers=ana)
        assert 200 <= response.status_code < 300
    count = await connection.scalar(
        text("SELECT count(*) FROM user_blocks WHERE blocker_id=:a AND blocked_id=:b"),
        {"a": ana_id, "b": bob_id},
    )
    assert count == 0
