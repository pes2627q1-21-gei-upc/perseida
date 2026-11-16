import asyncio
import os
from pathlib import Path

import asyncpg  # type: ignore[import-untyped]
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from app.infrastructure.persistence.config import DatabaseSettings


def _alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    return config


def test_alembic_has_single_head() -> None:
    heads = ScriptDirectory.from_config(_alembic_config()).get_heads()
    assert len(heads) == 1


@pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)
def test_postgis_migration_upgrade_downgrade() -> None:
    config = _alembic_config()
    settings = DatabaseSettings()

    async def query_database(query: str) -> object:
        connection = await asyncpg.connect(
            host=settings.postgres_host,
            port=settings.postgres_port,
            user=settings.postgres_user,
            password=settings.postgres_password,
            database=settings.postgres_db,
        )
        try:
            return await connection.fetchval(query)
        finally:
            await connection.close()

    command.downgrade(config, "base")
    try:
        command.upgrade(config, "head")
        command.upgrade(config, "head")

        version = asyncio.run(query_database("SELECT version_num FROM alembic_version"))
        postgis_version = asyncio.run(query_database("SELECT PostGIS_Version()"))
        extension_exists = asyncio.run(
            query_database(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
            )
        )

        assert version == ScriptDirectory.from_config(config).get_current_head()
        # TG-135 / US #45 criteri 1: el head crea les taules d'usuaris
        for table in ("users", "user_identities"):
            assert asyncio.run(query_database(f"SELECT to_regclass('public.{table}')"))
        assert postgis_version
        assert extension_exists

        command.downgrade(config, "base")
        extension_exists = asyncio.run(
            query_database(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
            )
        )
        assert not extension_exists
        for table in ("users", "user_identities"):
            assert (
                asyncio.run(query_database(f"SELECT to_regclass('public.{table}')"))
                is None
            )
    finally:
        command.upgrade(config, "head")


@pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)
def test_models_match_migrations() -> None:
    # TG-135: les taules de SQLModel i la migració no divergeixen, i les taules
    # de PostGIS (spatial_ref_sys, tiger...) no surten com a esborrables
    config = _alembic_config()
    command.upgrade(config, "head")
    command.check(config)


SNAPSHOT_QUERIES = {
    "extensions": "SELECT extname FROM pg_extension ORDER BY 1",
    "columns": """
        SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
               a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND c.relname <> 'alembic_version' AND a.attnum > 0
          AND NOT a.attisdropped
          AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE objid = c.oid
                          AND deptype = 'e')
        ORDER BY 1, 2""",
    "indexes": """
        SELECT tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename <> 'alembic_version'
          AND tablename <> 'spatial_ref_sys'
        ORDER BY 1, 2""",
    "constraints": """
        SELECT c.relname, k.conname, pg_get_constraintdef(k.oid)
        FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname <> 'alembic_version'
          AND c.relname <> 'spatial_ref_sys'
        ORDER BY 1, 2""",
}


async def _schema_snapshot() -> dict[str, list[tuple[object, ...]]]:
    settings = DatabaseSettings()
    connection = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_db,
    )
    try:
        return {
            name: [tuple(row) for row in await connection.fetch(query)]
            for name, query in SNAPSHOT_QUERIES.items()
        }
    finally:
        await connection.close()


@pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)
def test_every_revision_can_be_undone() -> None:
    # TG-360 / US #360 criteri 8: CD rollback (ADR-0025) runs `alembic downgrade`
    # to the previous image's revision, so each revision must undo cleanly.
    # WARNING: it downgrades to base; it wipes the database it points at.
    config = _alembic_config()
    revisions = list(ScriptDirectory.from_config(config).walk_revisions())

    try:
        command.downgrade(config, "base")
        for revision in reversed(revisions):
            # The history is linear (see test_alembic_has_single_head).
            previous = str(revision.down_revision or "base")
            before = asyncio.run(_schema_snapshot())

            command.upgrade(config, revision.revision)
            command.downgrade(config, previous)

            assert asyncio.run(_schema_snapshot()) == before, (
                f"downgrade of {revision.revision} does not restore the schema"
            )
            command.upgrade(config, revision.revision)
    finally:
        command.upgrade(config, "head")
