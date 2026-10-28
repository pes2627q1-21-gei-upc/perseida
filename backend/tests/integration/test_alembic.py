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
