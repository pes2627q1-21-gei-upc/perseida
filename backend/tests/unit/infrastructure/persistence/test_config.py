import pytest
from pydantic import ValidationError

from app.infrastructure.persistence.config import DatabaseSettings


def test_database_url_uses_asyncpg() -> None:
    settings = DatabaseSettings(
        postgres_db="perseida",
        postgres_user="postgres",
        postgres_password="test-password",
        postgres_host="localhost",
        postgres_port=5432,
        _env_file=None,
    )

    assert settings.database_url.drivername == "postgresql+asyncpg"
    assert settings.database_url.database == "perseida"
    assert settings.database_url.host == "localhost"
    assert settings.database_url.port == 5432
    assert settings.database_url.username == "postgres"


def test_missing_required_settings_are_reported() -> None:
    with pytest.raises(ValidationError) as exc_info:
        DatabaseSettings(_env_file=None)

    errors = exc_info.value.errors()
    missing_fields = {str(error["loc"][0]) for error in errors}

    assert {
        "postgres_db",
        "postgres_user",
        "postgres_password",
        "postgres_host",
        "postgres_port",
    }.issubset(missing_fields)
