"""NasaApodProvider with the RSS feed first and the JSON API as fallback (TG-328).

Fake cache and repository; the NASA is simulated (respx).
"""

import json
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx
from pydantic import SecretStr

from app.application.apod.errors import APOD_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.infrastructure.apod.nasa_client import APOD_URL, NasaApodClient
from app.infrastructure.apod.nasa_feed_client import FEED_URL, NasaApodFeedClient
from app.infrastructure.apod.nasa_provider import RETRY_AFTER_SECONDS, NasaApodProvider
from tests.factories.apod import make_apod
from tests.fakes.apod import FakeApodRepository
from tests.fakes.cache import FakeCache

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
TODAY = date(2026, 10, 25)
IN_FEED = date(2026, 10, 24)
OLD = date(2026, 9, 1)


def feed_xml() -> str:
    return (FIXTURES / "nasa_apod_feed.xml").read_text(encoding="utf-8")


def api_answer(day: date) -> dict[str, object]:
    body = json.loads((FIXTURES / "nasa_apod_image.json").read_text(encoding="utf-8"))
    return {**body, "date": day.isoformat()}


@pytest.fixture
async def http() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient() as client:
        yield client


@pytest.fixture
def cache() -> FakeCache:
    return FakeCache()


@pytest.fixture
def repository() -> FakeApodRepository:
    return FakeApodRepository()


def build(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> NasaApodProvider:
    return NasaApodProvider(
        NasaApodClient(http, SecretStr("test-key"), timeout_seconds=1),
        cache,
        repository,
        today=lambda: TODAY,
        feed_client=NasaApodFeedClient(http, timeout_seconds=1),
    )


@respx.mock
async def test_tg328_feed_answers_without_calling_the_api(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    feed = respx.get(FEED_URL).respond(text=feed_xml())
    api = respx.get(APOD_URL).respond(500)

    apod = await build(http, cache, repository).get_by_date(IN_FEED)

    assert apod.title == "The Orion Nebula"
    assert repository.by_date[IN_FEED] == apod
    assert feed.call_count == 1
    assert api.call_count == 0


@respx.mock
async def test_tg328_feed_failure_falls_back_to_the_api_without_caching_it(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(FEED_URL).respond(503)
    respx.get(APOD_URL).respond(json=api_answer(OLD))

    apod = await build(http, cache, repository).get_by_date(OLD)

    assert apod.apod_date == OLD
    assert "apod:unavailable:2026-09-01" not in cache.values


@respx.mock
async def test_tg328_date_out_of_the_feed_window_uses_the_api(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(FEED_URL).respond(text=feed_xml())
    api = respx.get(APOD_URL).respond(json=api_answer(OLD))

    assert (await build(http, cache, repository).get_by_date(OLD)).apod_date == OLD
    assert api.call_count == 1


@respx.mock
async def test_tg328_failure_is_cached_only_when_feed_and_api_both_fail(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    feed = respx.get(FEED_URL).respond(503)
    api = respx.get(APOD_URL).respond(503)
    provider = build(http, cache, repository)

    for _ in range(3):
        with pytest.raises(ExternalServiceError) as raised:
            await provider.get_by_date(IN_FEED)
        assert raised.value.code == APOD_UNAVAILABLE

    assert feed.call_count == api.call_count == 1
    assert cache.ttls["apod:unavailable:2026-10-24"] == RETRY_AFTER_SECONDS


@respx.mock
async def test_tg328_date_older_than_the_feed_window_skips_the_feed(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    feed = respx.get(FEED_URL).respond(200, text=feed_xml())
    api = respx.get(APOD_URL).respond(200, json=api_answer(OLD))
    provider = build(http, cache, repository)

    apod = await provider.get_by_date(OLD)

    assert apod.apod_date == OLD
    assert feed.call_count == 0
    assert api.call_count == 1


@respx.mock
async def test_tg328_both_down_serves_the_stored_apod(
    http: httpx.AsyncClient, cache: FakeCache
) -> None:
    respx.get(FEED_URL).respond(503)
    respx.get(APOD_URL).respond(503)
    stored = make_apod(OLD)

    provider = build(http, cache, FakeApodRepository([stored]))

    assert await provider.get_by_date(OLD) == stored


@respx.mock
async def test_tg328_today_comes_from_the_latest_feed_entry(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    route = respx.get(FEED_URL).respond(text=feed_xml())

    apod = await build(http, cache, repository).get_today()

    assert apod.apod_date == TODAY
    assert route.call_count == 1
