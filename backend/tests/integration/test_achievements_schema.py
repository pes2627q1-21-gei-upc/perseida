"""Migration and catalog of achievements (TG-58 / task TG-572)."""

import asyncio
import json
import os
import re
import unicodedata
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import command
from app.domain.achievements.models import (
    Achievement,
    AchievementCategory,
    AchievementKind,
)
from app.infrastructure.persistence.config import DatabaseSettings

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

BACKEND_DIR = Path(__file__).resolve().parents[2]
SEED = BACKEND_DIR / "alembic" / "seed" / "achievements.json"
TABLES = ("achievements", "user_achievements")
PREFIX = "qa_ach_schema"
EXPECTED_PER_CATEGORY = {
    "streaks": 6,
    "quiz": 5,
    "events": 6,
    "social": 9,
    "minigame": 8,
}
# (code, kind, threshold, category, position), from catalog-de-fites.md.
KNOWN = {
    "primera_llum": ("streak_days", 1, "streaks", 1),
    "orbita_setmanal": ("streak_days", 7, "streaks", 2),
    "perseida": ("streak_days", 365, "streaks", 6),
    "telescopi_nou": ("quiz_completed", 1, "quiz", 1),
    "cel_clar": ("quiz_perfect", 1, "quiz", 2),
    "primera_alineacio": ("event_subscription", 1, "events", 1),
    "cacador_d_eclipsis": ("event_subscription", 10, "events", 2),
    "satellit": ("followers", 1, "social", 1),
    "llancament": ("minigame_played", 1, "minigame", 1),
    "llegenda_cosmica": ("minigame_won", 100, "minigame", 8),
}


def _config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["configure_logger"] = False
    return config


def _seed() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(SEED.read_text(encoding="utf-8"))
    return data


def _slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")


async def _fetchval(query: str) -> object:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            return (await connection.execute(text(query))).scalar()
    finally:
        await engine.dispose()


def _tables_exist() -> list[bool]:
    return [
        asyncio.run(_fetchval(f"SELECT to_regclass('public.{table}')")) is not None
        for table in TABLES
    ]


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    command.upgrade(_config(), "head")


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM achievements WHERE code LIKE :p"),
                {"p": f"{PREFIX}%"},
            )
        await engine.dispose()


def test_tg572_migration_creates_both_tables_and_can_go_down_and_up() -> None:
    # The head must be the achievements migration: undo only that revision.
    # It drops only the two tables of this task, never the other modules' data.
    config = _config()
    head = ScriptDirectory.from_config(config).get_current_head()
    assert head is not None
    assert _tables_exist() == [True, True]

    try:
        command.downgrade(config, "-1")
        assert _tables_exist() == [False, False]
        command.upgrade(config, "head")
        assert _tables_exist() == [True, True]
        assert asyncio.run(_fetchval("SELECT count(*) FROM achievements")) == 34
    finally:
        command.upgrade(config, "head")


async def _insert_achievement(
    engine: AsyncEngine,
    *,
    code: str,
    threshold: int = 1,
    category: str = "social",
    position: int = 9000,
) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO achievements (code, name, description, kind,"
                " threshold, category, position) VALUES (:code, 'n', 'd',"
                " 'followers', :threshold, :category, :position)"
            ),
            {
                "code": code,
                "threshold": threshold,
                "category": category,
                "position": position,
            },
        )


async def test_tg572_id_defaults_to_a_uuid7(engine: AsyncEngine) -> None:
    await _insert_achievement(engine, code=f"{PREFIX}_id", position=9001)
    async with engine.connect() as connection:
        value = (
            await connection.execute(
                text("SELECT id FROM achievements WHERE code = :c"),
                {"c": f"{PREFIX}_id"},
            )
        ).scalar_one()
    assert uuid.UUID(str(value)).version == 7


async def test_tg572_code_is_unique(engine: AsyncEngine) -> None:
    await _insert_achievement(engine, code=f"{PREFIX}_dup", position=9002)
    with pytest.raises(IntegrityError):
        await _insert_achievement(engine, code=f"{PREFIX}_dup", position=9003)


async def test_tg572_category_and_position_are_unique(engine: AsyncEngine) -> None:
    await _insert_achievement(engine, code=f"{PREFIX}_a", position=9004)
    with pytest.raises(IntegrityError):
        await _insert_achievement(engine, code=f"{PREFIX}_b", position=9004)


@pytest.mark.parametrize("threshold", [0, -1])
async def test_tg572_threshold_must_be_at_least_one(
    engine: AsyncEngine, threshold: int
) -> None:
    with pytest.raises(IntegrityError):
        await _insert_achievement(
            engine, code=f"{PREFIX}_t", threshold=threshold, position=9005
        )


@pytest.mark.parametrize("position", [0, -1])
async def test_tg572_position_must_be_at_least_one(
    engine: AsyncEngine, position: int
) -> None:
    with pytest.raises(IntegrityError):
        await _insert_achievement(engine, code=f"{PREFIX}_p", position=position)


async def test_tg572_user_achievements_rejects_unknown_user_and_achievement(
    engine: AsyncEngine,
) -> None:
    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO user_achievements (user_id, achievement_id,"
                    " unlocked_at) SELECT :u, id, now() FROM achievements LIMIT 1"
                ),
                {"u": uuid.uuid4()},
            )
    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO user_achievements (user_id, achievement_id,"
                    " unlocked_at) SELECT id, :a, now() FROM users LIMIT 1"
                ),
                {"a": uuid.uuid4()},
            )


async def test_tg572_unique_user_and_achievement_pair_and_restrict(
    engine: AsyncEngine,
) -> None:
    unique = f"{PREFIX}-{uuid.uuid4().hex}"
    async with engine.begin() as connection:
        user_id = (
            await connection.execute(
                text(
                    "INSERT INTO users (google_sub, email, display_name)"
                    " VALUES (:s, :e, 'Ada') RETURNING id"
                ),
                {"s": f"sub-{unique}", "e": f"{unique}@example.test"},
            )
        ).scalar_one()
    insert = text(
        "INSERT INTO user_achievements (user_id, achievement_id, unlocked_at)"
        " SELECT :u, id, now() FROM achievements WHERE code = 'primera_llum'"
    )
    try:
        async with engine.begin() as connection:
            await connection.execute(insert, {"u": user_id})
        with pytest.raises(IntegrityError):
            async with engine.begin() as connection:
                await connection.execute(insert, {"u": user_id})
        # ON DELETE RESTRICT on both foreign keys.
        with pytest.raises(IntegrityError):
            async with engine.begin() as connection:
                await connection.execute(
                    text("DELETE FROM users WHERE id = :u"), {"u": user_id}
                )
        with pytest.raises(IntegrityError):
            async with engine.begin() as connection:
                await connection.execute(
                    text("DELETE FROM achievements WHERE code = 'primera_llum'")
                )
    finally:
        async with engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM user_achievements WHERE user_id = :u"),
                {"u": user_id},
            )
            await connection.execute(
                text("DELETE FROM user_identities WHERE user_id = :u"), {"u": user_id}
            )
            await connection.execute(
                text("DELETE FROM users WHERE id = :u"), {"u": user_id}
            )


async def test_tg572_seed_has_the_34_achievements_of_the_catalog(
    engine: AsyncEngine,
) -> None:
    seed = _seed()
    assert len(seed) == 34
    async with engine.connect() as connection:
        rows = (
            await connection.execute(
                text("SELECT id, code, category FROM achievements")
            )
        ).all()
    # Other rows may exist, but the whole seed must be loaded, with its fixed ids.
    stored = {row.code: (row.id, row.category) for row in rows}
    for item in seed:
        assert stored[item["code"]] == (uuid.UUID(item["id"]), item["category"])


async def test_tg572_catalog_codes_are_unique_slugs_of_the_names() -> None:
    seed = _seed()
    codes = [item["code"] for item in seed]
    assert len(set(codes)) == 34
    assert all(re.fullmatch(r"[a-z0-9]+(_[a-z0-9]+)*", c) for c in codes)
    # The middle dot of "Satèl·lit" and "Col·leccionista" is dropped: ``satellit``.
    assert all(item["code"] == _slug(item["name"]) for item in seed)
    ids = [uuid.UUID(item["id"]) for item in seed]
    assert len(set(ids)) == 34
    assert all(i.version == 7 for i in ids)


async def test_tg572_each_category_has_positions_one_to_n_without_gaps() -> None:
    positions: dict[str, list[int]] = defaultdict(list)
    for item in _seed():
        positions[item["category"]].append(item["position"])
    assert {k: len(v) for k, v in positions.items()} == EXPECTED_PER_CATEGORY
    for values in positions.values():
        assert sorted(values) == list(range(1, len(values) + 1))


async def test_tg572_known_achievements_have_their_kind_threshold_and_place() -> None:
    by_code = {item["code"]: item for item in _seed()}
    for code, (kind, threshold, category, position) in KNOWN.items():
        item = by_code[code]
        assert (
            item["kind"],
            item["threshold"],
            item["category"],
            item["position"],
        ) == (
            kind,
            threshold,
            category,
            position,
        ), code


async def test_tg572_every_seed_item_is_a_valid_domain_achievement() -> None:
    for item in _seed():
        achievement = Achievement.model_validate(item)
        assert isinstance(achievement.kind, AchievementKind)
        assert isinstance(achievement.category, AchievementCategory)
        assert achievement.name.strip()
        assert achievement.description.strip()
