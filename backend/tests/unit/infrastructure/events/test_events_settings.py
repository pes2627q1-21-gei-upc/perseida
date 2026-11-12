"""EventsSettings: Launch Library 2 URL and timeouts (TG-50, task #508)."""

from typing import Any

import pytest
from pydantic import ValidationError

from app.infrastructure.events.config import EventsSettings
from app.infrastructure.events.launch_library import LAUNCH_LIBRARY_URL


def settings(**values: Any) -> EventsSettings:
    return EventsSettings(_env_file=None, **values)


def test_tg50_defaults_need_no_environment() -> None:
    events = settings()

    assert events.launch_library_url == LAUNCH_LIBRARY_URL
    assert events.events_connect_timeout_seconds == 3.0
    assert events.events_timeout_seconds == 10.0


def test_tg50_url_can_be_overridden_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LAUNCH_LIBRARY_URL", "https://lldev.thespacedevs.com/x/")

    assert settings().launch_library_url == "https://lldev.thespacedevs.com/x/"


@pytest.mark.parametrize("url", ["http://example.org/", "nope", ""])
def test_tg50_url_must_be_https(url: str) -> None:
    with pytest.raises(ValidationError):
        settings(launch_library_url=url)


@pytest.mark.parametrize(
    "field", ["events_connect_timeout_seconds", "events_timeout_seconds"]
)
def test_tg50_timeouts_must_be_positive(field: str) -> None:
    with pytest.raises(ValidationError):
        settings(**{field: 0})
