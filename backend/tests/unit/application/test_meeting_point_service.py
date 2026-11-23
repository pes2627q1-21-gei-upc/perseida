"""MeetingPointService: Spotwise search, Perseida filter and cache (TG-352)."""

import pytest

from app.application.meeting_points.errors import MEETING_POINTS_UNAVAILABLE
from app.application.meeting_points.meeting_point_service import MeetingPointService
from app.application.shared.errors import ExternalServiceError
from app.domain.meeting_points.models import MeetingPointProfile, SessionProfile
from app.domain.shared.location import Location
from tests.factories.meeting_points import EXAMPLE_SPACES, LIBRARY_12, make_space
from tests.fakes.cache import FakeCache
from tests.fakes.meeting_points import FakeSpaceSearch

NEAR = Location(latitude=41.40449, longitude=2.17123)
ROUNDED = Location(latitude=41.404, longitude=2.171)
WATCH_PARTY_KEY = "meeting_points:watch_party:41.404:2.171"


def _service(
    search: FakeSpaceSearch, cache: FakeCache | None = None
) -> tuple[MeetingPointService, FakeCache]:
    cache = cache or FakeCache()
    return MeetingPointService(search, cache), cache


async def test_tg352_c4_watch_party_searches_with_its_profile_and_filters() -> None:
    # TG-352 criteri 4, amb la resposta d'exemple de Spotwise
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    service, _ = _service(search)

    result = await service.recommend(MeetingPointProfile.WATCH_PARTY, NEAR)

    assert result == [LIBRARY_12]
    ((_, profile),) = search.calls
    assert profile == SessionProfile.of(MeetingPointProfile.WATCH_PARTY)


async def test_tg352_c4_study_searches_with_its_profile() -> None:
    silent = make_space(id=7)
    search = FakeSpaceSearch([*EXAMPLE_SPACES, silent])
    service, _ = _service(search)

    result = await service.recommend(MeetingPointProfile.STUDY, NEAR)

    assert result == [silent]
    ((_, profile),) = search.calls
    assert profile == SessionProfile.of(MeetingPointProfile.STUDY)


async def test_tg352_c1_searches_with_the_location_rounded_to_3_decimals() -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    service, _ = _service(search)

    await service.recommend(MeetingPointProfile.WATCH_PARTY, NEAR)

    ((near, _),) = search.calls
    assert near == ROUNDED


async def test_tg352_a_miss_stores_the_filtered_result_for_300_seconds() -> None:
    service, cache = _service(FakeSpaceSearch(EXAMPLE_SPACES))

    await service.recommend(MeetingPointProfile.WATCH_PARTY, NEAR)

    assert list(cache.values) == [WATCH_PARTY_KEY]
    assert cache.ttls[WATCH_PARTY_KEY] == 300


@pytest.mark.parametrize(
    ("profile", "near", "key"),
    [
        (
            MeetingPointProfile.STUDY,
            Location(latitude=41.38506, longitude=2.17340),
            "meeting_points:study:41.385:2.173",
        ),
        (
            MeetingPointProfile.WATCH_PARTY,
            Location(latitude=41.3, longitude=2.0),
            "meeting_points:watch_party:41.300:2.000",
        ),
        (
            MeetingPointProfile.STUDY,
            Location(latitude=-33.86882, longitude=-151.20929),
            "meeting_points:study:-33.869:-151.209",
        ),
    ],
)
async def test_tg352_the_cache_key_has_the_profile_and_the_rounded_location(
    profile: MeetingPointProfile, near: Location, key: str
) -> None:
    service, cache = _service(FakeSpaceSearch(EXAMPLE_SPACES))

    await service.recommend(profile, near)

    assert list(cache.values) == [key]


async def test_tg352_a_hit_returns_the_cached_result_without_calling_spotwise() -> None:
    cache = FakeCache()
    first_search = FakeSpaceSearch(EXAMPLE_SPACES)
    first, _ = _service(first_search, cache)
    first_result = await first.recommend(MeetingPointProfile.WATCH_PARTY, NEAR)
    second_search = FakeSpaceSearch(failure=AssertionError("Spotwise was called"))
    second, _ = _service(second_search, cache)

    # A nearby point rounds to the same key.
    result = await second.recommend(
        MeetingPointProfile.WATCH_PARTY, Location(latitude=41.4041, longitude=2.1709)
    )

    assert result == first_result == [LIBRARY_12]
    assert second_search.calls == []


async def test_tg352_an_empty_result_is_cached_too() -> None:
    cache = FakeCache()
    first, _ = _service(FakeSpaceSearch([]), cache)
    assert await first.recommend(MeetingPointProfile.STUDY, NEAR) == []
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    second, _ = _service(search, cache)

    assert await second.recommend(MeetingPointProfile.STUDY, NEAR) == []
    assert search.calls == []


async def test_tg352_profiles_do_not_share_the_cache() -> None:
    search = FakeSpaceSearch(EXAMPLE_SPACES)
    service, cache = _service(search)

    await service.recommend(MeetingPointProfile.WATCH_PARTY, NEAR)
    await service.recommend(MeetingPointProfile.STUDY, NEAR)

    assert len(search.calls) == 2
    assert set(cache.values) == {
        WATCH_PARTY_KEY,
        "meeting_points:study:41.404:2.171",
    }


async def test_tg352_c5_a_spotwise_failure_propagates_and_nothing_is_cached() -> None:
    failure = ExternalServiceError(MEETING_POINTS_UNAVAILABLE)
    service, cache = _service(FakeSpaceSearch(failure=failure))

    with pytest.raises(ExternalServiceError) as raised:
        await service.recommend(MeetingPointProfile.WATCH_PARTY, NEAR)

    assert raised.value.code == MEETING_POINTS_UNAVAILABLE
    assert cache.values == {}


def test_tg352_error_code_is_stable() -> None:
    assert MEETING_POINTS_UNAVAILABLE == "MEETING_POINTS_UNAVAILABLE"
