"""NasaApodFeedClient against a simulated feed (respx). Fixture in tests/fixtures/.

The fixture is a reduced copy of https://science.nasa.gov/feed/apod-basic/
(2026-10-25): an image with ``&#038;`` in the URL and HTML in the copyright, a
plain image, a video (no image URL) and an image with an empty copyright.
"""

import asyncio
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from app.domain.apod.models import MediaType
from app.infrastructure.apod.nasa_client import NasaApodError
from app.infrastructure.apod.nasa_feed_client import FEED_URL, NasaApodFeedClient

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
FEED = (FIXTURES / "nasa_apod_feed.xml").read_text(encoding="utf-8")
ORION = (
    "https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2026/"
    "october/orion.png"
)
LOGO = "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png"


@pytest.fixture
async def client() -> AsyncIterator[NasaApodFeedClient]:
    async with httpx.AsyncClient() as http:
        yield NasaApodFeedClient(http, timeout_seconds=1)


@respx.mock
async def test_tg328_without_date_returns_the_most_recent_entry(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    apod = await client.fetch()

    assert apod.apod_date == date(2026, 10, 25)
    assert apod.title == "Dark Matter in a Simulated Universe"
    assert apod.media_type is MediaType.IMAGE


@respx.mock
async def test_tg328_decodes_xml_entities_in_the_image_url(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    apod = await client.fetch(date(2026, 10, 25))

    assert apod.media_url == (
        "https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2021/"
        "october/DarkMatter_1200.jpg?w=1200&h=900&fit=clip&crop=faces%2Cfocalpoint"
    )


@respx.mock
async def test_tg328_html_is_removed_from_explanation_and_copyright(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    apod = await client.fetch(date(2026, 10, 25))

    assert apod.copyright == "Tom Abel & Ralf Kaehler (KIPAC)"
    assert apod.explanation == (
        "Is our universe haunted? It might look that way on this dark matter map."
    )


@respx.mock
async def test_tg328_by_date_returns_that_entry_with_trimmed_copyright(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    apod = await client.fetch(date(2026, 10, 24))

    assert apod.title == "The Orion Nebula"
    assert apod.copyright == "Jane Doe"
    assert apod.explanation == "A stellar nursery about 1,300 light-years away."
    assert apod.media_url == ORION


@respx.mock
async def test_tg328_curly_apostrophe_in_tomorrows_picture_is_cut(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(
        text=FEED.replace("Tomorrow's picture", "Tomorrow’s picture")
    )

    apod = await client.fetch(date(2026, 10, 25))

    assert "Tomorrow" not in apod.explanation


@respx.mock
async def test_tg328_empty_copyright_is_none(client: NasaApodFeedClient) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    apod = await client.fetch(date(2026, 10, 22))

    assert apod.copyright is None
    assert apod.explanation == "Sunlight glints off a solar array & more."


@respx.mock
async def test_tg328_the_date_is_the_utc_day_of_the_publication(
    client: NasaApodFeedClient,
) -> None:
    late = FEED.replace(
        "Sat, 24 Oct 2026 04:05:12 +0000", "Sat, 24 Oct 2026 23:30:00 -0500"
    )
    respx.get(FEED_URL).respond(text=late)

    # 23:30 at UTC-5 is already the 25th in UTC.
    with pytest.raises(NasaApodError):
        await client.fetch(date(2026, 10, 24))


@respx.mock
async def test_tg328_a_date_outside_the_feed_window_raises(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    with pytest.raises(NasaApodError, match="no entry"):
        await client.fetch(date(2026, 9, 1))


@respx.mock
async def test_tg328_a_video_entry_is_discarded(client: NasaApodFeedClient) -> None:
    respx.get(FEED_URL).respond(text=FEED)

    with pytest.raises(NasaApodError, match="not an image"):
        await client.fetch(date(2026, 10, 23))


@respx.mock
async def test_tg328_the_placeholder_logo_is_rejected(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).respond(text=FEED.replace(ORION, LOGO))

    with pytest.raises(NasaApodError, match="placeholder"):
        await client.fetch(date(2026, 10, 24))


@respx.mock
async def test_tg328_a_media_url_that_is_not_https_breaks_a_domain_rule(
    client: NasaApodFeedClient,
) -> None:
    insecure = FEED.replace(ORION, "http://example.org/orion.png")
    respx.get(FEED_URL).respond(text=insecure)

    with pytest.raises(NasaApodError, match="domain rule"):
        await client.fetch(date(2026, 10, 24))


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(200, text="<rss><channel>"),
        httpx.Response(200, text="not xml at all"),
        httpx.Response(200, text="<rss><channel></channel></rss>"),
        httpx.Response(
            200,
            text='<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaa">]><rss/>',
        ),
        httpx.Response(200, content=b"<rss>" + b" " * (5 * 1024 * 1024) + b"</rss>"),
    ],
    ids=["500", "truncated", "not-xml", "empty-feed", "dtd", "too-large"],
)
@respx.mock
async def test_tg328_unusable_answers_raise_nasa_apod_error(
    client: NasaApodFeedClient, response: httpx.Response
) -> None:
    respx.get(FEED_URL).mock(return_value=response)

    with pytest.raises(NasaApodError):
        await client.fetch()


@respx.mock
async def test_tg328_items_without_a_valid_date_are_ignored(
    client: NasaApodFeedClient,
) -> None:
    broken = FEED.replace("Sun, 25 Oct 2026 08:19:48 +0000", "yesterday-ish")
    respx.get(FEED_URL).respond(text=broken)

    assert (await client.fetch()).apod_date == date(2026, 10, 24)


@respx.mock
async def test_tg328_network_errors_raise_nasa_apod_error(
    client: NasaApodFeedClient,
) -> None:
    respx.get(FEED_URL).mock(side_effect=httpx.ConnectTimeout("timed out"))

    with pytest.raises(NasaApodError) as raised:
        await client.fetch()

    # Only the type in the message; the httpx error stays as the cause.
    assert str(raised.value) == "NASA APOD feed request failed: ConnectTimeout"
    assert isinstance(raised.value.__cause__, httpx.ConnectTimeout)


async def test_tg328_the_whole_request_is_bounded_by_the_timeout() -> None:
    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(1)
        return httpx.Response(200, text=FEED)

    async with httpx.AsyncClient(transport=httpx.MockTransport(slow)) as http:
        client = NasaApodFeedClient(http, timeout_seconds=0.05)

        with pytest.raises(NasaApodError):
            await client.fetch()
