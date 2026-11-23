"""Migration of the chat tables against PostgreSQL for real (TG-448, ADR-0024):
event_chat_rooms and chat_messages, their keys, cascades and the history index.
"""

import asyncio
import os

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


def test_tg654_c1_messages_have_a_not_null_uuid_client_message_id() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    assert asyncio.run(_fetch(CLIENT_ID_COLUMN)) == [("uuid", "NO")]


def test_tg654_c2_the_client_message_id_is_unique_per_author() -> None:
    config = _alembic_config()
    command.upgrade(config, "head")

    assert ("u", ["author_id", "client_message_id"], None, None) in asyncio.run(
        _fetch(MESSAGE_KEYS)
    )


def _revision_of_client_message_id() -> Script:
    """The event-chat idempotency migration (TG-654), not direct chat."""
    revision = ScriptDirectory.from_config(_alembic_config()).get_revision(
        "e7a3c5b9d104"
    )
    assert revision is not None
    return revision


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

    assert asyncio.run(_fetch(CLIENT_ID_COLUMN)) == [("uuid", "NO")]


# develop added the achievements migration after the chat one; ours must follow it so
# that Alembic keeps a single head (test_alembic_has_single_head).
def test_tg654_c4_the_migration_builds_on_the_achievements_migration() -> None:
    assert _revision_of_client_message_id().down_revision == "e7a3c5b9d201"


def test_tg654_c5_messages_from_before_the_migration_get_a_distinct_key() -> None:
    # Backfill with gen_random_uuid(): old rows end up with a non-null key and
    # the unique (author_id, client_message_id) holds even for the same author.
    config = _alembic_config()
    command.upgrade(config, "head")
    before = str(_revision_of_client_message_id().down_revision)
    user = "0198a000-0000-7000-8000-0000000065a1"
    event = "0198a000-0000-7000-8000-0000000065a2"
    room = "0198a000-0000-7000-8000-0000000065a3"
    old = (
        "0198a000-0000-7000-8000-0000000065b1",
        "0198a000-0000-7000-8000-0000000065b2",
    )
    command.downgrade(config, before)
    try:
        for statement in (
            f"INSERT INTO users (id, email) VALUES ('{user}', 'tg654@example.test')"
            " RETURNING id",
            "INSERT INTO astronomical_events (id, source, external_id, title, summary,"
            " category, starts_at, ends_at) VALUES"
            f" ('{event}', 'catalog', 'tg654-backfill', 'Event', 'Summary', 'lunar',"
            " now(), now() + interval '1 hour') RETURNING id",
            f"INSERT INTO event_chat_rooms (id, event_id) VALUES ('{room}', '{event}')"
            " RETURNING id",
            *(
                "INSERT INTO chat_messages (id, room_id, author_id, text) VALUES"
                f" ('{message}', '{room}', '{user}', 'abans') RETURNING id"
                for message in old
            ),
        ):
            asyncio.run(_fetch(statement))

        command.upgrade(config, "head")

        keys = asyncio.run(
            _fetch(
                "SELECT client_message_id FROM chat_messages"
                f" WHERE author_id = '{user}' ORDER BY id"
            )
        )
        assert len(keys) == 2
        assert all(row[0] is not None for row in keys)
        assert keys[0] != keys[1]
    finally:
        command.upgrade(config, "head")
        asyncio.run(
            _fetch(f"DELETE FROM astronomical_events WHERE id = '{event}' RETURNING id")
        )
        asyncio.run(_fetch(f"DELETE FROM users WHERE id = '{user}' RETURNING id"))
