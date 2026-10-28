"""NasaSettings: URL defaults and https validation (TG-328)."""

from typing import Any

import pytest
from pydantic import ValidationError

from app.infrastructure.apod.config import NasaSettings
from app.infrastructure.apod.nasa_client import APOD_URL
from app.infrastructure.apod.nasa_feed_client import FEED_URL


def settings(**values: Any) -> NasaSettings:
    return NasaSettings(_env_file=None, nasa_api_key="key", **values)


def test_tg328_urls_default_to_the_science_nasa_feed_and_the_api() -> None:
    nasa = settings()

    assert nasa.nasa_apod_feed_url == "https://science.nasa.gov/feed/apod-basic/"
    assert nasa.nasa_apod_feed_url == FEED_URL
    assert nasa.nasa_apod_api_url == "https://api.nasa.gov/planetary/apod"
    assert nasa.nasa_apod_api_url == APOD_URL


def test_tg328_urls_can_be_overridden_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NASA_APOD_FEED_URL", "https://example.org/feed/")

    assert settings().nasa_apod_feed_url == "https://example.org/feed/"


@pytest.mark.parametrize("field", ["nasa_apod_feed_url", "nasa_apod_api_url"])
@pytest.mark.parametrize("url", ["http://example.org/feed", "ftp://x/y", "nope", ""])
def test_tg328_urls_must_be_https(field: str, url: str) -> None:
    with pytest.raises(ValidationError):
        settings(**{field: url})
