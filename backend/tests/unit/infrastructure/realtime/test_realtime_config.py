import pytest
from app.infrastructure.realtime.config import RealtimeSettings
from pydantic import ValidationError

from app.application.realtime.realtime_session import RealtimeConfig


def test_defaults_are_ten_seconds_to_authenticate_and_thirty_of_heartbeat() -> None:
    settings = RealtimeSettings(_env_file=None)

    assert settings.ws_auth_timeout_seconds == 10.0
    assert settings.ws_heartbeat_seconds == 30.0


def test_the_values_are_read_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WS_AUTH_TIMEOUT_SECONDS", "3.5")
    monkeypatch.setenv("WS_HEARTBEAT_SECONDS", "12")

    settings = RealtimeSettings(_env_file=None)

    assert settings.ws_auth_timeout_seconds == 3.5
    assert settings.ws_heartbeat_seconds == 12.0


def test_it_builds_the_application_config() -> None:
    settings = RealtimeSettings(
        ws_auth_timeout_seconds=2, ws_heartbeat_seconds=5, _env_file=None
    )

    assert settings.config() == RealtimeConfig(
        auth_timeout_seconds=2, heartbeat_seconds=5
    )


@pytest.mark.parametrize("field", ["ws_auth_timeout_seconds", "ws_heartbeat_seconds"])
@pytest.mark.parametrize("value", [0, -1, -0.5])
def test_zero_and_negative_values_are_rejected(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        RealtimeSettings(_env_file=None, **{field: value})  # type: ignore[arg-type]
