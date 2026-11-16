"""Contract of ``ApodProvider`` shared by the fake and the real adapter (TG-46).

Swapping ``FakeApodProvider`` for ``NasaApodProvider`` must not change what the
service and the endpoint see. The NASA is simulated with respx.
"""

import json
from collections.abc import AsyncIterator, Callable
from datetime import date
from pathlib import Path
from typing import Literal

import httpx
import pytest
import respx
from pydantic import SecretStr

from app.application.apod.errors import APOD_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.apod.models import Apod, MediaType
from app.domain.apod.ports import ApodProvider
from app.infrastructure.apod.nasa_client import APOD_URL, NasaApodClient
from app.infrastructure.apod.nasa_provider import NasaApodProvider
from tests.factories.apod import make_apod
from tests.fakes.apod import FakeApodProvider, FakeApodRepository
from tests.fakes.cache import FakeCache

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
TODAY = date(2026, 10, 21)
DAY = date(2026, 10, 14)

# up: the source answers; stored: it is down but the APODs were stored before;
# empty: it is down and nothing is stored.
Source = Literal["up", "stored", "empty"]
ProviderFactory = Callable[[Source], ApodProvider]


def _nasa(request: httpx.Request) -> httpx.Response:
    body = json.loads((FIXTURES / "nasa_apod_image.json").read_text(encoding="utf-8"))
    day = request.url.params.get("date", TODAY.isoformat())
    return httpx.Response(200, json={**body, "date": day})


@pytest.fixture(params=["fake", "nasa"])
async def make_provider(
    request: pytest.FixtureRequest,
) -> AsyncIterator[ProviderFactory]:
    if request.param == "fake":

        def fake(source: Source) -> ApodProvider:
            empty = source == "empty"
            failure = ExternalServiceError(APOD_UNAVAILABLE) if empty else None
            apods = [make_apod(DAY), make_apod(TODAY)]
            return FakeApodProvider(apods, today=TODAY, failure=failure)

        yield fake
        return

    async with httpx.AsyncClient() as http, respx.mock:

        def nasa(source: Source) -> ApodProvider:
            route = respx.get(APOD_URL)
            if source == "up":
                route.mock(side_effect=_nasa)
            else:
                route.respond(503)
            repository = FakeApodRepository()
            if source == "stored":
                for day in (DAY, TODAY):
                    repository.by_date[day] = make_apod(day)
            client = NasaApodClient(http, SecretStr("test-key"), timeout_seconds=1)
            return NasaApodProvider(
                client, FakeCache(), repository, today=lambda: TODAY
            )

        yield nasa


def _assert_is_apod_of(apod: Apod, day: date) -> None:
    assert isinstance(apod, Apod)
    assert apod.apod_date == day
    assert apod.title
    assert apod.explanation
    assert apod.media_type in (MediaType.IMAGE, MediaType.VIDEO)
    assert apod.media_url
    assert apod.copyright is None or isinstance(apod.copyright, str)


async def test_tg46_c1_get_by_date_returns_the_apod_of_that_date(
    make_provider: ProviderFactory,
) -> None:
    _assert_is_apod_of(await make_provider("up").get_by_date(DAY), DAY)


async def test_tg46_c1_get_today_returns_todays_apod(
    make_provider: ProviderFactory,
) -> None:
    _assert_is_apod_of(await make_provider("up").get_today(), TODAY)


async def test_tg46_c6_source_down_returns_the_stored_apod(
    make_provider: ProviderFactory,
) -> None:
    provider = make_provider("stored")

    _assert_is_apod_of(await provider.get_by_date(DAY), DAY)
    _assert_is_apod_of(await provider.get_today(), TODAY)


async def test_tg46_c7_unavailable_source_raises_apod_unavailable(
    make_provider: ProviderFactory,
) -> None:
    provider = make_provider("empty")

    for call in (provider.get_today, lambda: provider.get_by_date(DAY)):
        with pytest.raises(ExternalServiceError) as raised:
            await call()
        assert raised.value.code == APOD_UNAVAILABLE
