"""TG-65: the direct-chat inbox includes profiles without N+1 queries."""

import os
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from tests.integration.chat.test_chat_api import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.chat.test_chat_api import _schema_at_head as _schema_at_head
from tests.integration.chat.test_chat_api import app as app
from tests.integration.chat.test_chat_api import client as client
from tests.integration.chat.test_chat_api import connection as connection
from tests.integration.chat.test_chat_api import factory as factory
from tests.integration.chat.test_chat_api import google_certs as google_certs
from tests.integration.chat.test_chat_api import login_headers, user_id_of
from tests.integration.direct_chat.test_direct_chat_repository import (
    _user,
    conversations as conversations,
    engine as engine,
    sessions as sessions,
)
from app.domain.direct_chat.ports import DirectConversationRepository

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)


@pytest.mark.parametrize("count", [1, 5, 20])
async def test_tg65_summaries_include_other_profiles_in_one_query(
    count: int,
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
    captured_sql: list[tuple[str, Any]],
) -> None:
    me = await _user(sessions)
    expected: dict[uuid.UUID, tuple[str, str]] = {}
    for i in range(count):
        other = await _user(sessions)
        name, avatar = f"Observer {i}", f"https://example.test/avatar-{i}.png"
        async with sessions.begin() as session:
            await session.execute(
                text(
                    "UPDATE users SET display_name=:name, avatar_url=:avatar WHERE id=:id"
                ),
                {"id": other.id, "name": name, "avatar": avatar},
            )
        conversation, _ = await conversations.get_or_create(me.id, other.id)
        expected[conversation.id] = (name, avatar)
    captured_sql.clear()
    summaries = await conversations.summaries_of(me.id)
    assert len(captured_sql) == 1
    assert {
        s.conversation.id: (s.other_display_name, s.other_avatar_url) for s in summaries
    } == expected


async def test_tg65_missing_profile_fields_remain_null(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other = await _user(sessions), await _user(sessions)
    async with sessions.begin() as session:
        await session.execute(
            text("UPDATE users SET display_name=NULL, avatar_url=NULL WHERE id=:id"),
            {"id": other.id},
        )
    await conversations.get_or_create(me.id, other.id)
    [summary] = await conversations.summaries_of(me.id)
    assert summary.other_display_name is None
    assert summary.other_avatar_url is None


async def test_tg65_inbox_returns_other_profile_without_per_row_queries(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    me = await login_headers(client)
    assert (await client.get("/api/direct-conversations", headers=me)).json() == []
    expected: dict[str, tuple[str, str]] = {}
    statements: list[str] = []

    def capture(*args: Any) -> None:
        statements.append(str(args[2]))

    sync_engine = connection.engine.sync_engine
    for i in range(5):
        other = await login_headers(client)
        other_id = await user_id_of(client, other)
        name, avatar = f"Observer {i}", f"https://example.test/avatar-{i}.png"
        await connection.execute(
            text(
                "UPDATE users SET display_name=:name, avatar_url=:avatar WHERE id=:id"
            ),
            {"id": other_id, "name": name, "avatar": avatar},
        )
        created = await client.post(
            "/api/direct-conversations", headers=me, json={"user_id": str(other_id)}
        )
        assert created.status_code == 201
        expected[created.json()["id"]] = (name, avatar)
        if i == 0:
            event.listen(sync_engine, "before_cursor_execute", capture)
            try:
                first = await client.get("/api/direct-conversations", headers=me)
            finally:
                event.remove(sync_engine, "before_cursor_execute", capture)
            one_count = len(statements)
            statements.clear()
            assert first.status_code == 200
    event.listen(sync_engine, "before_cursor_execute", capture)
    try:
        response = await client.get("/api/direct-conversations", headers=me)
    finally:
        event.remove(sync_engine, "before_cursor_execute", capture)
    assert response.status_code == 200
    assert len(statements) == one_count
    assert {
        row["conversation_id"]: (row["other_display_name"], row["other_avatar_url"])
        for row in response.json()
    } == expected
