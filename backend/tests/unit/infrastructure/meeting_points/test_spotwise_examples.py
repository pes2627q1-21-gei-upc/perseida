"""Spotwise mock, settings and adapter choice (TG-352 criteris 2 i 3)."""

import json
import logging
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import SecretStr, ValidationError

import app.infrastructure.meeting_points.examples as examples_module
from app.domain.meeting_points.models import MeetingPointProfile, SessionProfile
from app.domain.shared.location import Location
from app.infrastructure.meeting_points.config import SpotwiseSettings
from app.infrastructure.meeting_points.dependencies import build_space_search
from app.infrastructure.meeting_points.examples import ExampleSpaceSearch
from app.infrastructure.meeting_points.spotwise_client import SpotwiseSpaceClient
from tests.factories.meeting_points import EXAMPLE_SPACES

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "fixtures"
    / "spotwise_espais_watch_party.json"
)


def settings(**values: Any) -> SpotwiseSettings:
    return SpotwiseSettings(_env_file=None, **values)


# --- mock (criteri 3) -----------------------------------------------------------


@pytest.mark.parametrize("profile", list(MeetingPointProfile))
@pytest.mark.parametrize(
    "near",
    [Location(latitude=41.404, longitude=2.171), Location(latitude=0, longitude=0)],
)
async def test_tg352_c3_the_mock_returns_the_example_spaces(
    profile: MeetingPointProfile, near: Location
) -> None:
    spaces = await ExampleSpaceSearch().search(near, SessionProfile.of(profile))

    assert spaces == list(EXAMPLE_SPACES)


def test_tg352_c3_the_mock_answer_is_the_spotwise_example() -> None:
    source = Path(examples_module.__file__).with_name("spotwise_examples.json")

    assert json.loads(source.read_text(encoding="utf-8")) == json.loads(
        FIXTURE.read_text(encoding="utf-8")
    )


# --- settings -------------------------------------------------------------------


def test_tg352_settings_defaults() -> None:
    spotwise = settings()

    assert spotwise.spotwise_url == "http://nattech.fib.upc.edu:40420"
    assert spotwise.spotwise_api_token is None
    assert spotwise.spotwise_timeout_seconds == 5.0


def test_tg352_settings_read_the_token_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SPOTWISE_API_TOKEN", "env-token")

    token = settings().spotwise_api_token

    assert isinstance(token, SecretStr)
    assert token.get_secret_value() == "env-token"
    assert "env-token" not in repr(settings())


@pytest.mark.parametrize("timeout", [0, -1])
def test_tg352_settings_timeout_must_be_positive(timeout: float) -> None:
    with pytest.raises(ValidationError):
        settings(spotwise_timeout_seconds=timeout)


@pytest.mark.parametrize(
    "url",
    [
        "nattech.fib.upc.edu:40420",
        "ftp://nattech.fib.upc.edu",
        "http://",
        "",
        "http:///x",
    ],
)
def test_tg352_settings_reject_an_unusable_spotwise_url(url: str) -> None:
    with pytest.raises(ValidationError):
        settings(spotwise_url=url)


@pytest.mark.parametrize(
    "url", ["http://spotwise.test:40420", "https://spotwise.test/base/"]
)
def test_tg352_settings_keep_a_valid_spotwise_url(url: str) -> None:
    assert settings(spotwise_url=url).spotwise_url == url


# --- adapter choice (criteris 2 i 3) --------------------------------------------


async def test_tg352_c3_without_token_the_mock_is_used() -> None:
    async with httpx.AsyncClient() as http:
        search = build_space_search(settings(), http)

    assert isinstance(search, ExampleSpaceSearch)


async def test_tg352_c2_with_token_the_spotwise_client_is_used() -> None:
    async with httpx.AsyncClient() as http:
        search = build_space_search(settings(spotwise_api_token="t"), http)

    assert isinstance(search, SpotwiseSpaceClient)


async def test_tg352_c3_choosing_the_mock_is_warned(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    async with httpx.AsyncClient() as http:
        build_space_search(settings(), http)

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "SPOTWISE_API_TOKEN" in warnings[0].getMessage()


async def test_tg352_c2_choosing_the_spotwise_client_is_not_warned(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    async with httpx.AsyncClient() as http:
        build_space_search(settings(spotwise_api_token="secret-t"), http)

    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert "secret-t" not in caplog.text
