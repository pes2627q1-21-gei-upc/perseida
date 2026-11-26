"""Migration of the direct chat tables against PostgreSQL for real (TG-65, ADR-0023):
direct_conversations, direct_messages and user_blocks, their keys, checks and the
history index.
"""

import asyncio
import os
from pathlib import Path

import pytest
from alembic.script import ScriptDirectory
from sqlmodel import SQLModel

from alembic import command
from tests.integration.test_alembic import _alembic_config, _fetch, _revision_before

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

TABLES = ("direct_conversations", "direct_messages", "user_blocks")
# The revision the direct chat migration builds on (the head when it was written).
PREVIOUS_HEAD = "a1c4e9b27d03"

# Primary, foreign and unique keys of a table (a foreign key with its ON DELETE).
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
      AND k.contype IN ('p', 'f', 'u')
    ORDER BY 1, 2"""
CHECKS = """
    SELECT k.conname::text, pg_get_constraintdef(k.oid)
    FROM pg_constraint k
    WHERE k.conrelid = 'public.{table}'::regclass AND k.contype = 'c'
    ORDER BY 1"""
UNIQUES = """
    SELECT k.conname::text FROM pg_constraint k
    WHERE k.conrelid = 'public.{table}'::regclass AND k.contype = 'u'
    ORDER BY 1"""
COLUMN = """
    SELECT data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = '{table}' AND column_name = '{column}'"""
MESSAGE_INDEXES = """
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'direct_messages'"""


# The table and column names are constants of this module, never user input.
def _keys(table: str) -> list[tuple[object, ...]]:
    return asyncio.run(_fetch(KEYS.format(table=table)))


def _checks(table: str) -> list[tuple[object, ...]]:
    return asyncio.run(_fetch(CHECKS.format(table=table)))


def _column(table: str, column: str) -> list[tuple[object, ...]]:
    return asyncio.run(_fetch(COLUMN.format(table=table, column=column)))


def _regclasses() -> list[object]:
    return [
        asyncio.run(_fetch(f"SELECT to_regclass('public.{table}')"))[0][0]
        for table in TABLES
    ]


def _creating_revision() -> str:
    """The id of the migration that creates the direct chat tables."""
    for revision in ScriptDirectory.from_config(_alembic_config()).walk_revisions():
        source = Path(str(revision.module.__file__)).read_text(encoding="utf-8")
        if '"direct_conversations"' in source and "create_table" in source:
            return revision.revision
    raise AssertionError("no migration creates direct_conversations")


def test_tg65_c1_conversations_have_one_row_per_ordered_pair_of_users() -> None:
    command.upgrade(_alembic_config(), "head")

    assert _keys("direct_conversations") == [
        ("f", ["user_a_id"], "users", "r"),
        ("f", ["user_b_id"], "users", "r"),
        ("p", ["id"], None, None),
        ("u", ["user_a_id", "user_b_id"], None, None),
    ]
    assert asyncio.run(_fetch(UNIQUES.format(table="direct_conversations"))) == [
        ("uq_direct_conversations_pair",)
    ]
    [(name, definition)] = _checks("direct_conversations")
    assert name == "ck_direct_conversations_pair_ordered"
    assert "user_a_id < user_b_id" in str(definition)


def test_tg65_c2_messages_belong_to_a_conversation_and_a_sender_without_cascades() -> (
    None
):
    command.upgrade(_alembic_config(), "head")

    assert _keys("direct_messages") == [
        ("f", ["conversation_id"], "direct_conversations", "r"),
        ("f", ["sender_id"], "users", "r"),
        ("p", ["id"], None, None),
        # one idempotency key per sender (like the event chat, TG-654)
        ("u", ["sender_id", "client_message_id"], None, None),
    ]
    [(name, _definition)] = _checks("direct_messages")
    assert name == "ck_direct_messages_text_not_empty"
    # The repository test verifies that this constraint rejects empty text.


def test_tg65_c3_blocks_are_keyed_by_the_pair_and_not_by_oneself() -> None:
    command.upgrade(_alembic_config(), "head")

    assert _keys("user_blocks") == [
        ("f", ["blocked_id"], "users", "r"),
        ("f", ["blocker_id"], "users", "r"),
        ("p", ["blocker_id", "blocked_id"], None, None),
    ]
    [(name, definition)] = _checks("user_blocks")
    assert name == "ck_user_blocks_not_self"
    assert "blocker_id <> blocked_id" in str(definition)


def test_tg65_c4_history_index_is_by_conversation_then_newest_first() -> None:
    command.upgrade(_alembic_config(), "head")

    indexes = {
        str(name): str(definition)
        for name, definition in asyncio.run(_fetch(MESSAGE_INDEXES))
    }

    assert (
        "(conversation_id, sent_at DESC, id DESC)"
        in indexes["ix_direct_messages_conversation_id_sent_at_id"]
    )


def test_tg65_c5_columns_follow_the_conventions_of_adr_0023() -> None:
    # UUIDv7 server default, timestamptz, VARCHAR(1000) text, nullable read marks.
    command.upgrade(_alembic_config(), "head")

    for table in ("direct_conversations", "direct_messages"):
        assert _column(table, "id") == [("uuid", "NO", "uuidv7()", None)]
    assert _column("direct_messages", "sent_at") == [
        ("timestamp with time zone", "NO", "now()", None)
    ]
    assert _column("direct_messages", "text") == [
        ("character varying", "NO", None, 1000)
    ]
    assert _column("direct_messages", "client_message_id") == [
        ("uuid", "NO", None, None)
    ]
    for column, nullable in (
        ("created_at", "NO"),
        ("user_a_read_at", "YES"),
        ("user_b_read_at", "YES"),
    ):
        [(data_type, is_nullable, _, _)] = _column("direct_conversations", column)
        assert (data_type, is_nullable) == ("timestamp with time zone", nullable)
    [(data_type, is_nullable, _, _)] = _column("user_blocks", "created_at")
    assert (data_type, is_nullable) == ("timestamp with time zone", "NO")


def test_tg65_c6_the_migration_builds_on_the_previous_head() -> None:
    # Alembic must keep a single head (test_alembic_has_single_head).
    script = ScriptDirectory.from_config(_alembic_config())

    assert script.get_revision(_creating_revision()).down_revision == PREVIOUS_HEAD


def test_tg65_c7_migration_creates_the_tables_and_undoes_them() -> None:
    # upgrade -> downgrade -> upgrade (ADR-0025: the CD rollback needs it).
    config = _alembic_config()
    command.upgrade(config, "head")
    try:
        command.downgrade(config, _revision_before("direct_conversations"))

        assert _regclasses() == [None, None, None]
    finally:
        command.upgrade(config, "head")

    assert all(table is not None for table in _regclasses())
    assert _keys("user_blocks")


def test_tg65_c8_models_and_migration_do_not_diverge() -> None:
    # The tables must be registered in SQLModel.metadata (persistence/models.py),
    # otherwise `alembic check` would not look at them at all.
    import app.infrastructure.persistence.models  # noqa: F401

    assert set(TABLES) <= set(SQLModel.metadata.tables)
    config = _alembic_config()
    command.upgrade(config, "head")
    command.check(config)
