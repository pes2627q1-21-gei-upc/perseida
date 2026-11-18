"""Migration of the chat tables against PostgreSQL for real (TG-448, ADR-0024):
event_chat_rooms and chat_messages, their keys, cascades and the history index.
"""

import asyncio
import os

import pytest

from alembic import command
from tests.integration.test_alembic import _alembic_config, _fetch, _revision_before

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

# Foreign keys (with their ON DELETE action) and unique keys of a table.
KEYS = """
    SELECT k.contype::text,
           (SELECT array_agg(a.attname::text ORDER BY u.ord)
              FROM unnest(k.conkey) WITH ORDINALITY AS u(attnum, ord)
              JOIN pg_attribute a
                ON a.attrelid = k.conrelid AND a.attnum = u.attnum),
           CASE WHEN k.contype = 'f' THEN k.confrelid::regclass::text END,
           CASE WHEN k.contype = 'f' THEN k.confdeltype::text END
    FROM pg_constraint k
    WHERE k.conrelid = 'public.{table}'::regclass
      AND k.contype IN ('f', 'u')
    ORDER BY 1, 2"""
# The table names are constants of this module, never user input.
ROOM_KEYS = KEYS.format(table="event_chat_rooms")
MESSAGE_KEYS = KEYS.format(table="chat_messages")
MESSAGE_INDEXES = """
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'chat_messages'"""


def test_tg448_c1_room_is_unique_per_event_and_cascades_from_the_event() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    assert asyncio.run(_fetch(ROOM_KEYS)) == [
        ("f", ["event_id"], "astronomical_events", "c"),
        ("u", ["event_id"], None, None),
    ]


def test_tg448_c2_messages_cascade_from_the_room_and_the_author() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    assert asyncio.run(_fetch(MESSAGE_KEYS)) == [
        ("f", ["author_id"], "users", "c"),
        ("f", ["room_id"], "event_chat_rooms", "c"),
    ]


def test_tg448_c3_history_index_is_by_room_then_newest_first() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    definitions = [str(row[0]) for row in asyncio.run(_fetch(MESSAGE_INDEXES))]

    assert any("(room_id, sent_at DESC, id DESC)" in item for item in definitions)


def test_tg448_c4_migration_creates_the_tables_and_undoes_them() -> None:
    # upgrade -> downgrade -> upgrade (ADR-0025: the CD rollback needs it).
    config = _alembic_config()
    command.upgrade(config, "head")
    try:
        command.downgrade(config, _revision_before("event_chat_rooms"))

        assert asyncio.run(_fetch("SELECT to_regclass('public.event_chat_rooms')")) == [
            (None,)
        ]
        assert asyncio.run(_fetch("SELECT to_regclass('public.chat_messages')")) == [
            (None,)
        ]
    finally:
        command.upgrade(config, "head")


def test_tg448_c5_sent_at_has_a_server_default_now() -> None:
    # ADR-0023: timestamps are timestamptz with server_default now().
    config = _alembic_config()
    command.upgrade(config, "head")

    assert asyncio.run(
        _fetch(
            "SELECT column_default FROM information_schema.columns "
            "WHERE table_name = 'chat_messages' AND column_name = 'sent_at'"
        )
    ) == [("now()",)]
