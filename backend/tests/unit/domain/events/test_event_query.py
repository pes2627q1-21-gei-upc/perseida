"""EventQuery: the filters of GET /api/events (TG-51, criteris 1, 2 i 4).

``to`` is included: the range is ``[from 00:00Z, (to + 1 day) 00:00Z)``. By
default ``from`` is today (UTC) and ``to`` is ``from + 30`` days; more than 90
days, ``from`` after ``to`` or an incomplete proximity is a VALIDATION_ERROR.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError as PydanticValidationError

from app.domain.events.models import EventCategory, EventQuery, Location, Proximity
from app.domain.shared.errors import ValidationError

TODAY = date(2026, 11, 17)
BARCELONA = Location(latitude=41.3874, longitude=2.1686)


def query(
    from_day: date | None = None,
    to_day: date | None = None,
    categories: list[EventCategory] | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: float | None = None,
) -> EventQuery:
    return EventQuery.from_filters(
        today=TODAY,
        from_day=from_day,
        to_day=to_day,
        categories=[] if categories is None else categories,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
    )


def midnight(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


def assert_validation_error(exc_info: pytest.ExceptionInfo[ValidationError]) -> None:
    assert exc_info.value.code == "VALIDATION_ERROR"


def test_tg51_c1_without_dates_the_range_is_today_and_the_next_30_days() -> None:
    result = query()

    assert result.start == midnight(TODAY)
    # ``to`` = today + 30 is included, so the end is the day after it.
    assert result.end == midnight(TODAY + timedelta(days=31))


def test_tg51_c1_only_to_starts_today() -> None:
    result = query(to_day=date(2026, 11, 20))

    assert result.start == midnight(TODAY)
    assert result.end == midnight(date(2026, 11, 21))


def test_tg51_c1_only_from_ends_30_days_after_it() -> None:
    result = query(from_day=date(2026, 12, 1))

    assert result.start == midnight(date(2026, 12, 1))
    assert result.end == midnight(date(2027, 1, 1))


def test_tg51_c1_to_is_included_until_the_end_of_that_utc_day() -> None:
    result = query(from_day=date(2026, 12, 13), to_day=date(2026, 12, 14))

    assert result.start == midnight(date(2026, 12, 13))
    assert result.end == midnight(date(2026, 12, 15))


def test_tg51_c1_from_equal_to_to_is_one_day() -> None:
    result = query(from_day=date(2026, 12, 14), to_day=date(2026, 12, 14))

    assert result.start == midnight(date(2026, 12, 14))
    assert result.end == midnight(date(2026, 12, 15))


def test_tg51_c1_dates_are_utc() -> None:
    result = query(from_day=date(2026, 12, 14), to_day=date(2026, 12, 14))

    assert result.start.utcoffset() == timedelta(0)
    assert result.end.utcoffset() == timedelta(0)


def test_tg51_c2_a_range_of_exactly_90_days_is_valid() -> None:
    result = query(from_day=date(2026, 11, 17), to_day=date(2027, 2, 15))

    assert result.end - result.start == timedelta(days=91)


def test_tg51_c2_a_range_of_91_days_is_a_validation_error() -> None:
    with pytest.raises(ValidationError) as exc_info:
        query(from_day=date(2026, 11, 17), to_day=date(2027, 2, 16))

    assert_validation_error(exc_info)


def test_tg51_c2_from_after_to_is_a_validation_error() -> None:
    with pytest.raises(ValidationError) as exc_info:
        query(from_day=date(2026, 12, 15), to_day=date(2026, 12, 14))

    assert_validation_error(exc_info)


def test_tg51_c2_only_to_before_today_is_a_validation_error() -> None:
    # ``from`` defaults to today, so a ``to`` in the past puts ``from`` after it.
    with pytest.raises(ValidationError) as exc_info:
        query(to_day=TODAY - timedelta(days=1))

    assert_validation_error(exc_info)


def test_tg51_c2_only_to_more_than_90_days_ahead_is_a_validation_error() -> None:
    with pytest.raises(ValidationError) as exc_info:
        query(to_day=TODAY + timedelta(days=91))

    assert_validation_error(exc_info)


def test_tg51_c1_without_categories_the_query_takes_them_all() -> None:
    assert query().categories == frozenset()


def test_tg51_c1_categories_are_kept_as_a_set() -> None:
    result = query(
        categories=[EventCategory.LUNAR, EventCategory.LAUNCH, EventCategory.LUNAR]
    )

    assert result.categories == frozenset({EventCategory.LUNAR, EventCategory.LAUNCH})


def test_tg51_c4_without_coordinates_there_is_no_proximity() -> None:
    assert query().near is None


def test_tg51_c4_with_coordinates_the_radius_defaults_to_500_km() -> None:
    result = query(lat=BARCELONA.latitude, lon=BARCELONA.longitude)

    assert result.near == Proximity(location=BARCELONA, radius_km=500)


def test_tg51_c4_with_coordinates_and_radius_the_radius_is_kept() -> None:
    result = query(lat=BARCELONA.latitude, lon=BARCELONA.longitude, radius_km=100)

    assert result.near == Proximity(location=BARCELONA, radius_km=100)


@pytest.mark.parametrize(
    ("lat", "lon", "radius_km"),
    [
        (41.3874, None, None),
        (None, 2.1686, None),
        (None, None, 100),
        (41.3874, None, 100),
        (None, 2.1686, 100),
    ],
    ids=[
        "lat-without-lon",
        "lon-without-lat",
        "radius-without-coordinates",
        "lat-and-radius-without-lon",
        "lon-and-radius-without-lat",
    ],
)
def test_tg51_c2_incomplete_proximity_is_a_validation_error(
    lat: float | None, lon: float | None, radius_km: float | None
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        query(lat=lat, lon=lon, radius_km=radius_km)

    assert_validation_error(exc_info)


@pytest.mark.parametrize("radius_km", [1, 20_000])
def test_tg51_c1_the_radius_limits_are_valid(radius_km: float) -> None:
    assert Proximity(location=BARCELONA, radius_km=radius_km).radius_km == radius_km


@pytest.mark.parametrize("radius_km", [0, 0.99, 20_000.01, -5])
def test_tg51_c1_a_radius_out_of_1_to_20000_km_is_rejected(radius_km: float) -> None:
    with pytest.raises((PydanticValidationError, ValidationError)):
        Proximity(location=BARCELONA, radius_km=radius_km)


def test_tg51_the_query_is_immutable() -> None:
    result = query()

    with pytest.raises(PydanticValidationError):
        result.start = midnight(TODAY + timedelta(days=1))  # type: ignore[misc]


days = st.dates(min_value=date(2000, 1, 1), max_value=date(2100, 12, 31))


@given(from_day=days, span=st.integers(min_value=0, max_value=90))
def test_tg51_c1_any_range_up_to_90_days_covers_whole_utc_days(
    from_day: date, span: int
) -> None:
    result = query(from_day=from_day, to_day=from_day + timedelta(days=span))

    assert result.start == midnight(from_day)
    assert result.end - result.start == timedelta(days=span + 1)


@given(from_day=days, span=st.integers(min_value=91, max_value=3650))
def test_tg51_c2_any_range_over_90_days_is_rejected(from_day: date, span: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        query(from_day=from_day, to_day=from_day + timedelta(days=span))

    assert_validation_error(exc_info)


@given(from_day=days, gap=st.integers(min_value=1, max_value=3650))
def test_tg51_c2_any_from_after_to_is_rejected(from_day: date, gap: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        query(from_day=from_day, to_day=from_day - timedelta(days=gap))

    assert_validation_error(exc_info)
