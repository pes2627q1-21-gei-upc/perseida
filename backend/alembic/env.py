import asyncio
from collections.abc import Callable
from logging.config import fileConfig

from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from alembic import context
from app.infrastructure.persistence import models  # noqa: F401
from app.infrastructure.persistence.config import DatabaseSettings

config = context.config

if config.config_file_name is not None and config.attributes.get(
    "configure_logger", True
):
    fileConfig(config.config_file_name)

settings = DatabaseSettings()
config.set_main_option(
    "sqlalchemy.url",
    settings.database_url.render_as_string(hide_password=False).replace("%", "%%"),
)

target_metadata = SQLModel.metadata

# Tables owned by an extension (PostGIS: spatial_ref_sys, tiger, topology...)
# are not ours: autogenerate must not propose dropping them.
EXTENSION_TABLES_QUERY = text(
    "SELECT c.relname FROM pg_class c "
    "JOIN pg_depend d ON d.classid = 'pg_class'::regclass "
    "AND d.objid = c.oid AND d.deptype = 'e' "
    "WHERE c.relkind IN ('r', 'p')"
)


def make_include_object(extension_tables: set[str]) -> Callable[..., bool]:
    def include_object(
        obj: object, name: str | None, type_: str, reflected: bool, compare_to: object
    ) -> bool:
        table = obj if type_ == "table" else getattr(obj, "table", None)
        table_name = getattr(table, "name", None)
        return not (reflected and compare_to is None and table_name in extension_tables)

    return include_object


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    extension_tables = set(connection.execute(EXTENSION_TABLES_QUERY).scalars())
    # The query autobegins a transaction that Alembic would then not commit.
    connection.commit()
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=make_include_object(extension_tables),
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    try:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
