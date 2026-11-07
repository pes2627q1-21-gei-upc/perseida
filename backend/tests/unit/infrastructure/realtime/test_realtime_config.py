import pytest
from pydantic import ValidationError

from app.application.realtime.realtime_session import RealtimeConfig
from app.infrastructure.realtime.config import RealtimeSettings


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


@pytest.mark.parametrize(
    "field",
    ["ws_auth_timeout_seconds", "ws_heartbeat_seconds", "ws_send_timeout_seconds"],
)
@pytest.mark.parametrize("value", [0, -1, -0.5])
def test_zero_and_negative_values_are_rejected(field: str, value: float) -> None:
    with pytest.raises(ValidationError):
        RealtimeSettings(_env_file=None, **{field: value})  # type: ignore[arg-type]


def test_room_and_frame_limits_default_to_20_and_64_kib() -> None:
    settings = RealtimeSettings(_env_file=None)

    assert settings.ws_max_rooms == 20
    assert settings.ws_max_frame_bytes == 65536


def test_the_limits_are_read_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WS_MAX_ROOMS", "3")
    monkeypatch.setenv("WS_MAX_FRAME_BYTES", "1024")

    settings = RealtimeSettings(_env_file=None)

    assert settings.ws_max_rooms == 3
    assert settings.ws_max_frame_bytes == 1024


def test_the_limits_reach_the_application_config() -> None:
    settings = RealtimeSettings(
        ws_auth_timeout_seconds=2,
        ws_heartbeat_seconds=5,
        ws_max_rooms=4,
        ws_max_frame_bytes=2048,
        _env_file=None,
    )

    assert settings.config() == RealtimeConfig(
        auth_timeout_seconds=2,
        heartbeat_seconds=5,
        max_rooms=4,
        max_frame_bytes=2048,
    )


@pytest.mark.parametrize("field", ["ws_max_rooms", "ws_max_frame_bytes"])
@pytest.mark.parametrize("value", [0, -1])
def test_zero_and_negative_limits_are_rejected(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        RealtimeSettings(_env_file=None, **{field: value})  # type: ignore[arg-type]


def test_send_timeout_defaults_to_five_seconds() -> None:
    settings = RealtimeSettings(_env_file=None)

    assert settings.ws_send_timeout_seconds == 5.0


def test_send_timeout_is_read_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WS_SEND_TIMEOUT_SECONDS", "2.5")

    settings = RealtimeSettings(_env_file=None)

    assert settings.ws_send_timeout_seconds == 2.5


def test_send_timeout_reaches_the_application_config() -> None:
    settings = RealtimeSettings(
        ws_auth_timeout_seconds=2,
        ws_heartbeat_seconds=5,
        ws_send_timeout_seconds=1.5,
        _env_file=None,
    )

    assert settings.config() == RealtimeConfig(
        auth_timeout_seconds=2, heartbeat_seconds=5, send_timeout_seconds=1.5
    )
