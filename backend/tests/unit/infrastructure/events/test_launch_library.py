"""LaunchLibraryEventSource against a simulated Launch Library 2 (respx).

The fixture keeps two real upcoming launches (recorded on 2026-11-10, trimmed
to the fields Perseida reads) and adds two broken ones: without mission and
without ``window_end``.
"""

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator, Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.application.events.event_service import EventService
from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import (
    AstronomicalEvent,
    EventCategory,
    EventDraft,
    EventSourceName,
    Location,
)
from app.infrastructure.events.launch_library import (
    LAUNCH_LIBRARY_URL,
    LaunchLibraryEventSource,
)
from tests.fakes.cache import FakeCache

# Outside fixtures/events/, which holds only EventResponse examples.
FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
HOUR = 3600.0


def upcoming_page() -> Any:
    path = FIXTURES / "launch_library_2_upcoming.json"
    return json.loads(path.read_text(encoding="utf-8"))


class Clock:
    """Monotonic clock moved by hand."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
async def make_source(
    clock: Clock,
) -> AsyncIterator[Callable[[], LaunchLibraryEventSource]]:
    async with httpx.AsyncClient() as http:
        yield lambda: LaunchLibraryEventSource(http, LAUNCH_LIBRARY_URL, clock)


@respx.mock
async def test_tg50_c3_maps_complete_launches_to_drafts(
    make_source: Callable[[], LaunchLibraryEventSource],
) -> None:
    respx.get(LAUNCH_LIBRARY_URL).respond(json=upcoming_page())

    drafts = await make_source().fetch()

    assert [draft.external_id for draft in drafts] == [
        "6aa7b90b-e5ed-45d8-a52e-04fbf399d178",
        "d66590ab-b273-47ff-b85a-608b62851b4b",
    ]
    first = drafts[0]
    assert first.source is EventSourceName.LAUNCH_LIBRARY_2
    assert first.category is EventCategory.LAUNCH
    assert first.title == "Falcon 9 Block 5 | USSF-627"
    assert first.summary.startswith("A classified mission for the United States")
    assert first.starts_at == datetime(2026, 11, 11, 2, 49, tzinfo=UTC)
    assert first.ends_at == datetime(2026, 11, 11, 6, 49, tzinfo=UTC)
    assert first.location == Location(latitude=34.632, longitude=-120.611)
    assert first.source_url == (
        "https://ll.thespacedevs.com/2.3.0/launches/"
        "6aa7b90b-e5ed-45d8-a52e-04fbf399d178/"
    )


@respx.mock
async def test_tg50_c3_discards_and_logs_incomplete_launches(
    make_source: Callable[[], LaunchLibraryEventSource],
    caplog: pytest.LogCaptureFixture,
) -> None:
    respx.get(LAUNCH_LIBRARY_URL).respond(json=upcoming_page())

    with caplog.at_level(logging.WARNING):
        drafts = await make_source().fetch()

    assert len(drafts) == 2
    assert "00000000-0000-4000-8000-000000000001" in caplog.text
    assert "00000000-0000-4000-8000-000000000002" in caplog.text


@respx.mock
async def test_tg50_c3_discards_a_launch_that_ends_before_it_starts(
    make_source: Callable[[], LaunchLibraryEventSource],
) -> None:
    page = upcoming_page()
    page["results"][0]["window_end"] = "2026-11-10T00:00:00Z"
    respx.get(LAUNCH_LIBRARY_URL).respond(json=page)

    drafts = await make_source().fetch()

    assert [draft.title for draft in drafts] == ["Long March 2D | Unknown Payload"]


@respx.mock
async def test_tg50_c3_a_launch_with_a_non_https_url_has_no_source_url(
    make_source: Callable[[], LaunchLibraryEventSource],
) -> None:
    page = upcoming_page()
    page["results"][0]["url"] = "http://example.com/launch"
    respx.get(LAUNCH_LIBRARY_URL).respond(json=page)

    drafts = await make_source().fetch()

    assert drafts[0].source_url is None


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(503),
        httpx.Response(429),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"unexpected": "shape"}),
    ],
)
async def test_tg50_c6_an_unusable_answer_is_an_external_service_error(
    make_source: Callable[[], LaunchLibraryEventSource], response: httpx.Response
) -> None:
    respx.get(LAUNCH_LIBRARY_URL).mock(return_value=response)

    with pytest.raises(ExternalServiceError) as exc_info:
        await make_source().fetch()

    assert exc_info.value.code == "EVENT_SOURCE_UNAVAILABLE"


@respx.mock
async def test_tg50_c6_a_timeout_is_an_external_service_error(
    make_source: Callable[[], LaunchLibraryEventSource],
) -> None:
    respx.get(LAUNCH_LIBRARY_URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(ExternalServiceError) as exc_info:
        await make_source().fetch()

    assert exc_info.value.code == "EVENT_SOURCE_UNAVAILABLE"


@respx.mock
async def test_tg50_c8_never_calls_more_than_once_per_hour(
    make_source: Callable[[], LaunchLibraryEventSource], clock: Clock
) -> None:
    route = respx.get(LAUNCH_LIBRARY_URL).respond(json=upcoming_page())
    source = make_source()
    first = await source.fetch()

    # Called less than an hour ago: the launches of that call again, and no
    # error (it is not a failure, e.g. a concurrent request or Redis down).
    clock.now = HOUR - 1
    assert await source.fetch() == first
    assert route.call_count == 1

    clock.now = HOUR
    await source.fetch()
    assert route.call_count == 2


@respx.mock
async def test_tg50_c8_a_failed_call_also_counts_towards_the_quota(
    make_source: Callable[[], LaunchLibraryEventSource], clock: Clock
) -> None:
    route = respx.get(LAUNCH_LIBRARY_URL).respond(503)
    source = make_source()
    with pytest.raises(ExternalServiceError):
        await source.fetch()

    clock.now = HOUR / 2

    assert await source.fetch() == []
    assert route.call_count == 1


async def test_tg50_c5_the_launch_freshness_lasts_one_hour(
    make_source: Callable[[], LaunchLibraryEventSource],
) -> None:
    source = make_source()

    assert source.name is EventSourceName.LAUNCH_LIBRARY_2
    assert source.ttl_seconds == 3600


@respx.mock
async def test_tg50_c3_a_launch_the_database_would_reject_is_discarded_alone(
    make_source: Callable[[], LaunchLibraryEventSource],
    caplog: pytest.LogCaptureFixture,
) -> None:
    page = upcoming_page()
    page["results"][0]["name"] = "Falcon 9\x00"
    page["results"][1]["id"] = "x" * 256
    page["results"].append(page["results"][0] | {"id": "kept", "name": "Kept"})
    respx.get(LAUNCH_LIBRARY_URL).respond(json=page)

    with caplog.at_level(logging.WARNING):
        drafts = await make_source().fetch()

    assert [draft.external_id for draft in drafts] == ["kept"]
    assert "6aa7b90b-e5ed-45d8-a52e-04fbf399d178" in caplog.text


@respx.mock
async def test_tg50_c3_an_item_that_is_not_an_object_is_discarded_alone(
    make_source: Callable[[], LaunchLibraryEventSource],
    caplog: pytest.LogCaptureFixture,
) -> None:
    page = upcoming_page()
    page["results"] += [42, None, "launch"]
    respx.get(LAUNCH_LIBRARY_URL).respond(json=page)

    with caplog.at_level(logging.WARNING):
        drafts = await make_source().fetch()

    assert len(drafts) == 2
    assert "Discarded incomplete launch" in caplog.text


class _StoringRepository:
    """Keeps the upserted drafts; the first upsert waits for ``gate``."""

    def __init__(self) -> None:
        self.stored: dict[str, EventDraft] = {}
        self.gate = asyncio.Event()
        self.first_started = asyncio.Event()
        self._first = True

    async def upsert_many(self, drafts: Sequence[EventDraft]) -> None:
        if self._first:
            self._first = False
            self.first_started.set()
            await self.gate.wait()
            raise RuntimeError("database down")
        self.stored |= {draft.external_id: draft for draft in drafts}

    async def list_starting_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        return [
            AstronomicalEvent(id=uuid.uuid7(), **draft.model_dump())
            for draft in self.stored.values()
        ]


@respx.mock
async def test_tg50_c8_concurrent_queries_never_answer_without_the_launches(
    make_source: Callable[[], LaunchLibraryEventSource],
) -> None:
    respx.get(LAUNCH_LIBRARY_URL).respond(json=upcoming_page())
    repository = _StoringRepository()
    service = EventService(
        repository,  # type: ignore[arg-type]
        [make_source()],
        FakeCache(),
        now=lambda: datetime(2026, 11, 10, tzinfo=UTC),
    )

    first = asyncio.create_task(service.upcoming(30))
    await repository.first_started.wait()
    # The second query arrives while the first is storing: the quota skips the
    # call, but it still stores and answers the launches.
    second = await service.upcoming(30)
    repository.gate.set()

    assert len(second) == 2
    with pytest.raises(RuntimeError):
        await first
    assert len(repository.stored) == 2
