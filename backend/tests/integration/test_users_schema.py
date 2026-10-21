import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import command
from app.infrastructure.persistence.config import DatabaseSettings

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

_INSERT_IDENTITY = text(
    "INSERT INTO user_identities (provider, subject, user_id) "
    "VALUES (:provider, :subject, :user_id)"
)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM user_identities"))
            await connection.execute(text("DELETE FROM users"))
        await engine.dispose()


@pytest.fixture
def email() -> str:
    return f"{uuid.uuid4().hex}@example.test"


async def _insert_user(engine: AsyncEngine, email: str, **columns: str) -> uuid.UUID:
    names = ["email", *columns]
    statement = text(
        f"INSERT INTO users ({', '.join(names)}) "
        f"VALUES ({', '.join(f':{name}' for name in names)}) RETURNING id"
    )
    async with engine.begin() as connection:
        result = await connection.execute(statement, {"email": email, **columns})
        user_id: uuid.UUID = result.scalar_one()
        return user_id


async def test_user_server_defaults(engine: AsyncEngine, email: str) -> None:
    # TG-135 / US #45 criteri 1: valors per defecte del servidor
    user_id = await _insert_user(engine, email)

    async with engine.connect() as connection:
        row = (
            await connection.execute(
                text("SELECT * FROM users WHERE id = :id"), {"id": user_id}
            )
        ).one()

    assert user_id.version == 7
    assert row.preferred_language == "ca"
    assert row.role == "user"
    assert row.status == "active"
    assert row.deleted_at is None
    assert row.display_name is None
    assert row.avatar_url is None
    for value in (row.created_at, row.last_login_at):
        assert value.tzinfo is not None
        assert abs(datetime.now(UTC) - value) < timedelta(minutes=5)


async def test_identity_created_at_defaults_to_now(
    engine: AsyncEngine, email: str
) -> None:
    # TG-135 / US #45 criteri 1
    user_id = await _insert_user(engine, email)
    async with engine.begin() as connection:
        await connection.execute(
            _INSERT_IDENTITY,
            {"provider": "google", "subject": "sub-1", "user_id": user_id},
        )
        created_at = (
            await connection.execute(
                text("SELECT created_at FROM user_identities WHERE user_id = :id"),
                {"id": user_id},
            )
        ).scalar_one()

    assert abs(datetime.now(UTC) - created_at) < timedelta(minutes=5)


async def test_duplicate_provider_subject_is_rejected(
    engine: AsyncEngine, email: str
) -> None:
    # TG-135 / US #45 criteri 4: (provider, subject) únic
    first = await _insert_user(engine, email)
    second = await _insert_user(engine, f"other-{email}")
    params = {"provider": "google", "subject": "sub-dup"}
    async with engine.begin() as connection:
        await connection.execute(_INSERT_IDENTITY, {**params, "user_id": first})

    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(_INSERT_IDENTITY, {**params, "user_id": second})


async def test_second_identity_for_same_user_and_provider_is_rejected(
    engine: AsyncEngine, email: str
) -> None:
    # TG-135 / US #45 criteri 4: una identitat per proveïdor i usuari
    user_id = await _insert_user(engine, email)
    async with engine.begin() as connection:
        await connection.execute(
            _INSERT_IDENTITY,
            {"provider": "google", "subject": "sub-a", "user_id": user_id},
        )

    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                _INSERT_IDENTITY,
                {"provider": "google", "subject": "sub-b", "user_id": user_id},
            )


async def test_duplicate_email_is_rejected(engine: AsyncEngine, email: str) -> None:
    # TG-135 / US #45 criteri 3: correu únic
    await _insert_user(engine, email)

    with pytest.raises(IntegrityError):
        await _insert_user(engine, email)


async def test_uppercase_email_is_rejected(engine: AsyncEngine, email: str) -> None:
    # TG-135 / US #45 criteri 3: correu en minúscules
    with pytest.raises(IntegrityError):
        await _insert_user(engine, email.upper())


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("role", "superuser"),
        ("status", "deleted"),
        ("preferred_language", "fr"),
    ],
)
async def test_invalid_enum_value_is_rejected(
    engine: AsyncEngine, email: str, column: str, value: str
) -> None:
    # TG-135 / US #45 criteri 1: restriccions CHECK
    with pytest.raises(IntegrityError):
        await _insert_user(engine, email, **{column: value})


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("role", "moderator"),
        ("role", "admin"),
        ("status", "suspended"),
        ("status", "banned"),
        ("preferred_language", "es"),
        ("preferred_language", "en"),
    ],
)
async def test_valid_enum_value_is_accepted(
    engine: AsyncEngine, email: str, column: str, value: str
) -> None:
    # TG-135 / US #45 criteri 1
    assert await _insert_user(engine, email, **{column: value})


async def test_invalid_provider_is_rejected(engine: AsyncEngine, email: str) -> None:
    # TG-135 / US #45 criteri 1
    user_id = await _insert_user(engine, email)

    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                _INSERT_IDENTITY,
                {"provider": "facebook", "subject": "sub-1", "user_id": user_id},
            )


async def test_deleting_user_with_identity_is_restricted(
    engine: AsyncEngine, email: str
) -> None:
    # TG-135 / US #45 criteri 5: el borrat físic no allibera el google_sub
    user_id = await _insert_user(engine, email)
    async with engine.begin() as connection:
        await connection.execute(
            _INSERT_IDENTITY,
            {"provider": "google", "subject": "sub-1", "user_id": user_id},
        )

    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM users WHERE id = :id"), {"id": user_id}
            )


async def test_soft_deleted_user_keeps_email_and_sub_reserved(
    engine: AsyncEngine, email: str
) -> None:
    # TG-135 / US #45 criteri 5: amb deleted_at informat no es pot recrear
    user_id = await _insert_user(engine, email)
    async with engine.begin() as connection:
        await connection.execute(
            _INSERT_IDENTITY,
            {"provider": "google", "subject": "sub-1", "user_id": user_id},
        )
        await connection.execute(
            text("UPDATE users SET deleted_at = now() WHERE id = :id"),
            {"id": user_id},
        )

    other_id = await _insert_user(engine, f"other-{email}")
    with pytest.raises(IntegrityError):
        await _insert_user(engine, email)
    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(
                _INSERT_IDENTITY,
                {"provider": "google", "subject": "sub-1", "user_id": other_id},
            )
