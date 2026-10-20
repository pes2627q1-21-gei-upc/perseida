import pytest
from pydantic import ValidationError

from app.infrastructure.auth.config import AuthSettings

CLIENT_ID = "client.apps.googleusercontent.com"
SECRET = "x" * 32


def test_token_lifetimes_default_to_15_minutes_and_30_days() -> None:
    settings = AuthSettings(
        google_client_id=CLIENT_ID, jwt_secret=SECRET, _env_file=None
    )

    assert settings.access_token_minutes == 15
    assert settings.refresh_token_days == 30


def test_settings_are_read_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("ACCESS_TOKEN_MINUTES", "5")
    monkeypatch.setenv("REFRESH_TOKEN_DAYS", "7")

    settings = AuthSettings(_env_file=None)

    assert settings.google_client_id == CLIENT_ID
    assert settings.jwt_secret == SECRET
    assert settings.access_token_minutes == 5
    assert settings.refresh_token_days == 7


def test_missing_client_id_and_secret_are_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        AuthSettings(_env_file=None)

    missing = {str(error["loc"][0]) for error in exc_info.value.errors()}
    assert missing == {"google_client_id", "jwt_secret"}


def test_a_secret_shorter_than_256_bits_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AuthSettings(google_client_id=CLIENT_ID, jwt_secret="x" * 31, _env_file=None)

    assert exc_info.value.errors()[0]["loc"] == ("jwt_secret",)
