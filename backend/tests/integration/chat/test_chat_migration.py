"""Migration of the chat tables against PostgreSQL for real (TG-448, ADR-0024):
event_chat_rooms and chat_messages, their keys, cascades and the history index.
"""

import asyncio
import os
from pathlib import Path

import pytest
from alembic.script import Script, ScriptDirectory

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
        # TG-654: one idempotency key per author (the contract grew, not shrank)
        ("u", ["author_id", "client_message_id"], None, None),
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


# --- TG-654: client_message_id (idempotencia) ----------------------------------

CLIENT_ID_COLUMN = """
    SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'client_message_id'"""


def test_tg654_c1_messages_have_a_nullable_uuid_client_message_id() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    assert asyncio.run(_fetch(CLIENT_ID_COLUMN)) == [("uuid", "YES")]


def test_tg654_c2_the_client_message_id_is_unique_per_author() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    assert ("u", ["author_id", "client_message_id"], None, None) in asyncio.run(
        _fetch(MESSAGE_KEYS)
    )


def _revision_of_client_message_id() -> Script:
    """The migration that adds the idempotency key."""
    for revision in ScriptDirectory.from_config(_alembic_config()).walk_revisions():
        source = Path(str(revision.module.__file__)).read_text(encoding="utf-8")
        if "client_message_id" in source:
            return revision
    raise AssertionError("no migration adds client_message_id")


def test_tg654_c3_the_migration_undoes_and_redoes_the_idempotency_key() -> None:
    # upgrade -> downgrade -> upgrade (ADR-0025: the CD rollback needs it).
    config = _alembic_config()
    command.upgrade(config, "head")
    before = str(_revision_of_client_message_id().down_revision)
    try:
        command.downgrade(config, before)

        assert asyncio.run(_fetch(CLIENT_ID_COLUMN)) == []
        assert asyncio.run(_fetch(MESSAGE_KEYS)) == [
            ("f", ["author_id"], "users", "c"),
            ("f", ["room_id"], "event_chat_rooms", "c"),
        ]
    finally:
        command.upgrade(config, "head")

    assert asyncio.run(_fetch(CLIENT_ID_COLUMN)) == [("uuid", "YES")]


def test_tg654_c4_the_migration_builds_on_the_chat_migration() -> None:
    assert _revision_of_client_message_id().down_revision == "b3e9a6d2c581"
