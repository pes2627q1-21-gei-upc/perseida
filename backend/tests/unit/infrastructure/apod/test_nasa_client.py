"""NasaApodClient against a simulated NASA (respx). Fixtures in tests/fixtures/.

The image and video fixtures follow the API format; the placeholder one is the
real answer the API gives since APOD moved to science.nasa.gov (2026-10-21).
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr

from app.domain.apod.models import MediaType
from app.infrastructure.apod.nasa_client import APOD_URL, NasaApodClient, NasaApodError

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
API_KEY = "secret-nasa-key-123"


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
async def client() -> AsyncIterator[NasaApodClient]:
    async with httpx.AsyncClient() as http:
        yield NasaApodClient(http, SecretStr(API_KEY), timeout_seconds=1)


@respx.mock
async def test_tg46_c5_maps_an_image_response_to_apod(client: NasaApodClient) -> None:
    respx.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    apod = await client.fetch(date(2026, 10, 14))

    assert apod.apod_date == date(2026, 10, 14)
    assert apod.title == "The Orion Nebula"
    assert apod.explanation == "A stellar nursery about 1,300 light-years away."
    assert apod.media_type is MediaType.IMAGE
    assert apod.media_url == "https://apod.nasa.gov/apod/image/2610/orion.jpg"
    assert apod.copyright == "Jane Doe"


@respx.mock
async def test_tg46_c5_maps_a_video_without_copyright(client: NasaApodClient) -> None:
    respx.get(APOD_URL).respond(json=fixture("nasa_apod_video.json"))

    apod = await client.fetch(date(2026, 10, 15))

    assert apod.media_type is MediaType.VIDEO
    assert apod.media_url == "https://www.youtube.com/embed/abc123"
    assert apod.copyright is None


@respx.mock
async def test_tg46_c2_sends_the_date_and_the_key_in_a_header(
    client: NasaApodClient,
) -> None:
    route = respx.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    await client.fetch(date(2026, 10, 14))

    request = route.calls.last.request
    assert request.url.params["date"] == "2026-10-14"
    assert request.headers["X-Api-Key"] == API_KEY
    assert API_KEY not in str(request.url)


@respx.mock
async def test_tg46_c2_asks_for_the_latest_apod_without_a_date(
    client: NasaApodClient,
) -> None:
    route = respx.get(APOD_URL).respond(json=fixture("nasa_apod_image.json"))

    await client.fetch()

    assert "date" not in route.calls.last.request.url.params


@respx.mock
async def test_tg46_c2_the_key_never_reaches_the_logs(
    client: NasaApodClient, caplog: pytest.LogCaptureFixture
) -> None:
    respx.get(APOD_URL).respond(500)
    caplog.set_level(logging.DEBUG)

    with pytest.raises(NasaApodError) as raised:
        await client.fetch(date(2026, 10, 14))

    assert API_KEY not in caplog.text
    assert API_KEY not in str(raised.value)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(404, json={"code": 404, "msg": "No data available"}),
        httpx.Response(400, json=fixture("nasa_apod_date_out_of_range.json")),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={**fixture("nasa_apod_video.json"), "url": None}),
        httpx.Response(
            200, json={**fixture("nasa_apod_image.json"), "media_type": "other"}
        ),
        httpx.Response(200, json=fixture("nasa_apod_placeholder.json")),
        httpx.Response(
            200,
            json={
                **fixture("nasa_apod_placeholder.json"),
                "url": "https://science.nasa.gov/wp-content/uploads/nasa-logo.svg",
            },
        ),
    ],
    ids=[
        "500",
        "404",
        "400",
        "not-json",
        "no-url",
        "other",
        "placeholder",
        "placeholder-other-path",
    ],
)
@respx.mock
async def test_tg46_c6_unusable_answers_raise_nasa_apod_error(
    client: NasaApodClient, response: httpx.Response
) -> None:
    respx.get(APOD_URL).mock(return_value=response)

    with pytest.raises(NasaApodError):
        await client.fetch(date(2026, 10, 14))


@respx.mock
async def test_tg46_c6_network_errors_raise_nasa_apod_error(
    client: NasaApodClient,
) -> None:
    respx.get(APOD_URL).mock(side_effect=httpx.ConnectTimeout("timed out"))

    with pytest.raises(NasaApodError) as raised:
        await client.fetch(date(2026, 10, 14))

    # Only the type in the message; the httpx error stays as the cause.
    assert str(raised.value) == "NASA APOD request failed: ConnectTimeout"
    assert isinstance(raised.value.__cause__, httpx.ConnectTimeout)


async def test_tg46_c2_the_whole_request_is_bounded_by_the_timeout() -> None:
    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(1)
        return httpx.Response(200, json=fixture("nasa_apod_image.json"))

    transport = httpx.MockTransport(slow)
    async with httpx.AsyncClient(transport=transport) as http:
        client = NasaApodClient(http, SecretStr(API_KEY), timeout_seconds=0.05)

        with pytest.raises(NasaApodError):
            await client.fetch(date(2026, 10, 14))
