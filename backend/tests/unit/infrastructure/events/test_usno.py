"""UsnoSolarEclipseSource against a simulated USNO API (respx).

The fixtures are the real answers for 2026 and 2027 (recorded on 2026-11-10).
"""

import json
import logging
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import EventCategory, EventSourceName
from app.infrastructure.events.usno import USNO_SOLAR_URL, UsnoSolarEclipseSource

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
TODAY = date(2026, 11, 10)


def eclipses(year: int) -> Any:
    path = FIXTURES / f"usno_solar_eclipses_{year}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def mock_years(
    first: httpx.Response | None = None, second: httpx.Response | None = None
) -> None:
    respx.get(USNO_SOLAR_URL, params={"year": "2026"}).mock(
        return_value=first or httpx.Response(200, json=eclipses(2026))
    )
    respx.get(USNO_SOLAR_URL, params={"year": "2027"}).mock(
        return_value=second or httpx.Response(200, json=eclipses(2027))
    )


@pytest.fixture
async def make_source() -> AsyncIterator[Callable[[], UsnoSolarEclipseSource]]:
    async with httpx.AsyncClient() as http:
        yield lambda: UsnoSolarEclipseSource(http, USNO_SOLAR_URL, lambda: TODAY)


@respx.mock
async def test_tg50_c3_maps_the_eclipses_of_this_year_and_the_next(
    make_source: Callable[[], UsnoSolarEclipseSource],
) -> None:
    mock_years()

    drafts = await make_source().fetch()

    assert [draft.title for draft in drafts] == [
        "Annular Solar Eclipse of 17 February 2026",
        "Total Solar Eclipse of 12 August 2026",
        "Annular Solar Eclipse of 6 February 2027",
        "Total Solar Eclipse of 2 August 2027",
    ]
    total = drafts[1]
    assert total.source is EventSourceName.USNO
    assert total.external_id == "solar:2026-08-12"
    assert total.category is EventCategory.SOLAR
    assert total.summary
    assert total.location is None
    assert total.source_url == "https://aa.usno.navy.mil/data/SolarEclipses"


@respx.mock
async def test_tg50_c3_an_eclipse_lasts_its_whole_utc_day(
    make_source: Callable[[], UsnoSolarEclipseSource],
) -> None:
    mock_years()

    total = (await make_source().fetch())[1]

    assert total.starts_at == datetime(2026, 8, 12, tzinfo=UTC)
    assert total.ends_at == datetime(2026, 8, 12, 23, 59, 59, tzinfo=UTC)


@respx.mock
async def test_tg50_c3_discards_and_logs_an_incomplete_eclipse(
    make_source: Callable[[], UsnoSolarEclipseSource],
    caplog: pytest.LogCaptureFixture,
) -> None:
    broken = eclipses(2026)
    broken["eclipses_in_year"][0]["month"] = 13
    mock_years(first=httpx.Response(200, json=broken))

    with caplog.at_level(logging.WARNING):
        drafts = await make_source().fetch()

    assert len(drafts) == 3
    assert "Discarded" in caplog.text


@respx.mock
async def test_tg50_c3_an_item_that_is_not_an_object_is_discarded_alone(
    make_source: Callable[[], UsnoSolarEclipseSource],
    caplog: pytest.LogCaptureFixture,
) -> None:
    mixed = eclipses(2026)
    mixed["eclipses_in_year"] += [42, None, "eclipse"]
    mock_years(first=httpx.Response(200, json=mixed))

    with caplog.at_level(logging.WARNING):
        drafts = await make_source().fetch()

    assert len(drafts) == 4
    assert "Discarded" in caplog.text


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(400, json={"error": "Year must be between 1800 and 2050"}),
        httpx.Response(200, json={"error": "Year must be between 1800 and 2050"}),
        httpx.Response(200, text="<html>maintenance</html>"),
    ],
)
async def test_tg50_c6_an_unusable_answer_is_an_external_service_error(
    make_source: Callable[[], UsnoSolarEclipseSource], response: httpx.Response
) -> None:
    mock_years(second=response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await make_source().fetch()

    assert exc_info.value.code == "EVENT_SOURCE_UNAVAILABLE"


@respx.mock
async def test_tg50_c6_a_timeout_is_an_external_service_error(
    make_source: Callable[[], UsnoSolarEclipseSource],
) -> None:
    respx.get(USNO_SOLAR_URL).mock(side_effect=httpx.ConnectTimeout("slow"))

    with pytest.raises(ExternalServiceError) as exc_info:
        await make_source().fetch()

    assert exc_info.value.code == "EVENT_SOURCE_UNAVAILABLE"


async def test_tg50_c5_eclipses_stay_fresh_for_a_day(
    make_source: Callable[[], UsnoSolarEclipseSource],
) -> None:
    source = make_source()

    assert source.name is EventSourceName.USNO
    assert source.ttl_seconds == 24 * 3600
