"""SpotwiseSpaceClient against a simulated Spotwise (respx), TG-352 criteri 6.

The fixture and the error bodies are the examples of the Spotwise document
(vault: arquitectura/contracte-spotwise.md).
"""

import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from pydantic import SecretStr

from app.application.meeting_points.errors import MEETING_POINTS_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.meeting_points.models import (
    MeetingPointProfile,
    SessionProfile,
    SilenceLevel,
    SpaceType,
)
from app.domain.shared.location import Location
from app.infrastructure.meeting_points.spotwise_client import SpotwiseSpaceClient
from tests.factories.meeting_points import EXAMPLE_SPACES, LIBRARY_12

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
BASE_URL = "http://spotwise.test:40420"
SPACES_URL = f"{BASE_URL}/api/espais/"
TOKEN = "secret-spotwise-token-123"
NEAR = Location(latitude=41.404, longitude=2.171)
WATCH_PARTY = SessionProfile.of(MeetingPointProfile.WATCH_PARTY)
STUDY = SessionProfile.of(MeetingPointProfile.STUDY)


def example() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(
        (FIXTURES / "spotwise_espais_watch_party.json").read_text(encoding="utf-8")
    )
    return data


@pytest.fixture
async def client() -> AsyncIterator[SpotwiseSpaceClient]:
    async with httpx.AsyncClient() as http:
        yield SpotwiseSpaceClient(http, BASE_URL, SecretStr(TOKEN), 5.0)


# --- correct answer -------------------------------------------------------------


@respx.mock
async def test_tg352_c6_converts_the_example_answer_to_spaces(
    client: SpotwiseSpaceClient,
) -> None:
    respx.get(SPACES_URL).respond(json=example())

    spaces = await client.search(NEAR, WATCH_PARTY)

    assert spaces == list(EXAMPLE_SPACES)


@respx.mock
async def test_tg352_c6_converts_every_space_type_and_level(
    client: SpotwiseSpaceClient,
) -> None:
    base = example()[0]
    answer = [
        {**base, "id": 1, "tipus": "biblioteca", "nivell_silenci": "silencios"},
        {**base, "id": 2, "tipus": "cafeteria", "nivell_silenci": "murmuri"},
        {
            **base,
            "id": 3,
            "tipus": "altre",
            "nivell_silenci": "sorollos",
            "endolls_disponibles": "pocs",
        },
        {**base, "id": 4, "endolls_disponibles": "cap", "apte_grup": False},
    ]
    respx.get(SPACES_URL).respond(json=answer)

    spaces = await client.search(NEAR, WATCH_PARTY)

    assert [s.type for s in spaces[:3]] == [
        SpaceType.LIBRARY,
        SpaceType.CAFE,
        SpaceType.OTHER,
    ]
    assert [s.silence for s in spaces[:3]] == [
        SilenceLevel.SILENT,
        SilenceLevel.MURMUR,
        SilenceLevel.NOISY,
    ]
    assert [s.plugs.value if s.plugs else None for s in spaces] == [
        "many",
        "many",
        "few",
        "none",
    ]
    assert spaces[3].group_friendly is False


@respx.mock
async def test_tg352_c1_watch_party_sends_location_group_and_the_token(
    client: SpotwiseSpaceClient,
) -> None:
    route = respx.get(SPACES_URL).respond(json=example())

    await client.search(NEAR, WATCH_PARTY)

    request = route.calls.last.request
    params = request.url.params
    assert sorted(params.keys()) == ["grup", "lat", "lon"]
    assert float(params["lat"]) == 41.404
    assert float(params["lon"]) == 2.171
    assert params["grup"] == "true"
    assert request.headers["Authorization"] == f"Token {TOKEN}"
    assert TOKEN not in str(request.url)


@respx.mock
async def test_tg352_c1_study_sends_silence_and_repeated_plugs(
    client: SpotwiseSpaceClient,
) -> None:
    route = respx.get(SPACES_URL).respond(json=[])

    await client.search(NEAR, STUDY)

    params = route.calls.last.request.url.params
    assert set(params.keys()) == {"lat", "lon", "silenci", "endolls"}
    assert params.get_list("silenci") == ["silencios"]
    assert sorted(params.get_list("endolls")) == ["molts", "pocs"]
    assert "grup" not in params


@respx.mock
async def test_tg352_c1_every_silence_value_is_sent_in_catalan(
    client: SpotwiseSpaceClient,
) -> None:
    route = respx.get(SPACES_URL).respond(json=[])
    profile = SessionProfile(
        group=None,
        silence=frozenset(SilenceLevel),
        plugs=frozenset(),
        wifi_required=False,
        max_distance_m=1500,
    )

    await client.search(NEAR, profile)

    params = route.calls.last.request.url.params
    assert sorted(params.get_list("silenci")) == ["murmuri", "silencios", "sorollos"]
    assert "endolls" not in params


@respx.mock
async def test_tg352_c5_uses_the_configured_timeout(
    client: SpotwiseSpaceClient,
) -> None:
    route = respx.get(SPACES_URL).respond(json=[])

    await client.search(NEAR, WATCH_PARTY)

    timeout = route.calls.last.request.extensions["timeout"]
    assert set(timeout.values()) == {5.0}


@respx.mock
async def test_tg352_c6_no_results_is_an_empty_list(
    client: SpotwiseSpaceClient,
) -> None:
    respx.get(SPACES_URL).respond(json=[])

    assert await client.search(NEAR, WATCH_PARTY) == []


@pytest.mark.parametrize(
    "invalid",
    [
        {"id": 99},
        "not a space",
        {**example()[0], "id": 98, "latitud": 200},
        {**example()[0], "id": 97, "distancia_m": "a prop"},
    ],
    ids=["missing-fields", "not-an-object", "latitude-out-of-range", "bad-distance"],
)
@respx.mock
async def test_tg352_c6_an_invalid_space_is_dropped_and_logged(
    client: SpotwiseSpaceClient, caplog: pytest.LogCaptureFixture, invalid: Any
) -> None:
    respx.get(SPACES_URL).respond(json=[example()[0], invalid, example()[1]])
    caplog.set_level(logging.DEBUG)

    spaces = await client.search(NEAR, WATCH_PARTY)

    assert spaces == list(EXAMPLE_SPACES)
    assert any(record.levelno >= logging.WARNING for record in caplog.records)
    assert TOKEN not in caplog.text


# --- Spotwise down or rejecting -------------------------------------------------


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="<html>Internal Server Error</html>"),
        httpx.Response(502),
        httpx.Response(503, json={"detail": "down"}),
        httpx.Response(400, json={"silenci": ["«alt» no és un valor vàlid."]}),
        httpx.Response(
            400,
            json={"non_field_errors": ["Cal enviar la latitud i la longitud juntes."]},
        ),
        httpx.Response(
            401, json={"detail": "Credencials d'autenticació no disponibles."}
        ),
        httpx.Response(401, json={"detail": "Token invàlid."}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"results": []}),
        httpx.Response(200, json=None),
    ],
    ids=[
        "500-html",
        "502-empty",
        "503-json",
        "400-param",
        "400-non-field",
        "401-missing",
        "401-invalid",
        "200-not-json",
        "200-object",
        "200-null",
    ],
)
@respx.mock
async def test_tg352_c5_c6_a_failed_answer_is_meeting_points_unavailable(
    client: SpotwiseSpaceClient,
    caplog: pytest.LogCaptureFixture,
    response: httpx.Response,
) -> None:
    respx.get(SPACES_URL).mock(return_value=response)
    caplog.set_level(logging.DEBUG)

    with pytest.raises(ExternalServiceError) as raised:
        await client.search(NEAR, WATCH_PARTY)

    assert raised.value.code == MEETING_POINTS_UNAVAILABLE
    assert TOKEN not in str(raised.value)
    assert TOKEN not in raised.value.message
    assert TOKEN not in caplog.text


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ReadTimeout("timed out"),
        httpx.ConnectTimeout("timed out"),
        httpx.ConnectError("connection refused"),
    ],
    ids=["read-timeout", "connect-timeout", "connect-error"],
)
@respx.mock
async def test_tg352_c5_c6_a_down_service_is_meeting_points_unavailable(
    client: SpotwiseSpaceClient,
    caplog: pytest.LogCaptureFixture,
    failure: Exception,
) -> None:
    respx.get(SPACES_URL).mock(side_effect=failure)
    caplog.set_level(logging.DEBUG)

    with pytest.raises(ExternalServiceError) as raised:
        await client.search(NEAR, WATCH_PARTY)

    assert raised.value.code == MEETING_POINTS_UNAVAILABLE
    assert TOKEN not in str(raised.value)
    assert TOKEN not in caplog.text


@respx.mock
async def test_tg352_c6_the_first_space_keeps_its_fields(
    client: SpotwiseSpaceClient,
) -> None:
    respx.get(SPACES_URL).respond(json=example())

    (first, _) = await client.search(NEAR, WATCH_PARTY)

    assert first == LIBRARY_12
    assert first.location == Location(latitude=41.4045, longitude=2.1712)


# --- outgoing rate limit (60 per minute, ADR-0003: one process) -----------------


class Clock:
    """Monotonic clock moved by hand."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@respx.mock
async def test_tg352_at_most_60_calls_per_minute_reach_spotwise() -> None:
    route = respx.get(SPACES_URL).respond(json=[])
    clock = Clock()
    async with httpx.AsyncClient() as http:
        client = SpotwiseSpaceClient(http, BASE_URL, SecretStr(TOKEN), 5.0, clock)
        for _ in range(60):
            await client.search(NEAR, WATCH_PARTY)
        clock.now += 59.9

        with pytest.raises(ExternalServiceError) as raised:
            await client.search(NEAR, WATCH_PARTY)

        assert raised.value.code == MEETING_POINTS_UNAVAILABLE
        assert route.call_count == 60
        clock.now += 0.1
        assert await client.search(NEAR, WATCH_PARTY) == []
        assert route.call_count == 61


@respx.mock
async def test_tg352_the_limit_is_a_sliding_minute() -> None:
    route = respx.get(SPACES_URL).respond(json=[])
    clock = Clock()
    async with httpx.AsyncClient() as http:
        client = SpotwiseSpaceClient(http, BASE_URL, SecretStr(TOKEN), 5.0, clock)
        for _ in range(30):
            await client.search(NEAR, WATCH_PARTY)
        clock.now += 30
        for _ in range(30):
            await client.search(NEAR, WATCH_PARTY)
        clock.now += 30
        # The first 30 left the window; the last 30 are still in it.
        for _ in range(30):
            await client.search(NEAR, WATCH_PARTY)

        with pytest.raises(ExternalServiceError):
            await client.search(NEAR, WATCH_PARTY)

    assert route.call_count == 90


@respx.mock
async def test_tg352_a_failed_call_counts_towards_the_limit() -> None:
    route = respx.get(SPACES_URL).respond(503)
    async with httpx.AsyncClient() as http:
        client = SpotwiseSpaceClient(http, BASE_URL, SecretStr(TOKEN), 5.0, Clock())
        for _ in range(61):
            with pytest.raises(ExternalServiceError):
                await client.search(NEAR, WATCH_PARTY)

    assert route.call_count == 60
