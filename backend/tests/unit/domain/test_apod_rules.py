from datetime import date

import pytest

from app.domain.apod.rules import FIRST_APOD_DATE, ensure_requestable
from app.domain.shared.errors import ValidationError

TODAY = date(2026, 10, 14)


@pytest.mark.parametrize("day", [FIRST_APOD_DATE, date(2000, 1, 1), TODAY])
def test_dates_inside_the_range_are_accepted(day: date) -> None:
    ensure_requestable(day, TODAY)


def test_a_future_date_is_rejected() -> None:
    with pytest.raises(ValidationError) as error:
        ensure_requestable(date(2026, 10, 15), TODAY)

    assert error.value.code == "APOD_DATE_IN_FUTURE"


def test_a_date_before_the_first_apod_is_rejected() -> None:
    with pytest.raises(ValidationError) as error:
        ensure_requestable(date(1995, 6, 15), TODAY)

    assert error.value.code == "APOD_DATE_BEFORE_START"


def test_first_apod_date_is_16_june_1995() -> None:
    assert FIRST_APOD_DATE.isoformat() == "1995-06-16"
