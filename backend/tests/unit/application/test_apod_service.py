from datetime import date

import pytest

from app.application.apod.apod_service import ApodService
from app.application.shared.errors import ExternalServiceError
from app.domain.shared.errors import ValidationError
from tests.factories.apod import make_apod
from tests.fakes.apod import FakeApodProvider

TODAY = date(2026, 10, 14)
PAST = date(2026, 10, 1)


def make_service(
    failure: Exception | None = None,
) -> tuple[ApodService, FakeApodProvider]:
    provider = FakeApodProvider(
        [make_apod(TODAY), make_apod(PAST)], today=TODAY, failure=failure
    )
    return ApodService(provider, today=lambda: TODAY), provider


async def test_without_a_date_it_returns_todays_apod() -> None:
    service, provider = make_service()

    apod = await service.get_apod()

    assert apod.apod_date == TODAY
    assert provider.requested == [None]


async def test_with_a_past_date_it_returns_that_apod() -> None:
    service, provider = make_service()

    apod = await service.get_apod(PAST)

    assert apod.apod_date == PAST
    assert provider.requested == [PAST]


async def test_todays_date_is_accepted() -> None:
    service, _ = make_service()

    assert (await service.get_apod(TODAY)).apod_date == TODAY


async def test_a_future_date_is_rejected_without_calling_the_provider() -> None:
    service, provider = make_service()

    with pytest.raises(ValidationError) as error:
        await service.get_apod(date(2026, 10, 15))

    assert error.value.code == "APOD_DATE_IN_FUTURE"
    assert provider.requested == []


async def test_a_date_before_the_first_apod_is_rejected_without_calling() -> None:
    service, provider = make_service()

    with pytest.raises(ValidationError) as error:
        await service.get_apod(date(1995, 6, 15))

    assert error.value.code == "APOD_DATE_BEFORE_START"
    assert provider.requested == []


@pytest.mark.parametrize("day", [None, PAST])
async def test_provider_failures_are_propagated(day: date | None) -> None:
    failure = ExternalServiceError("APOD_UNAVAILABLE", "nasa down")
    service, _ = make_service(failure)

    with pytest.raises(ExternalServiceError) as error:
        await service.get_apod(day)

    assert error.value is failure


async def test_the_default_clock_is_the_current_utc_date() -> None:
    provider = FakeApodProvider([make_apod(PAST)], today=PAST)

    apod = await ApodService(provider).get_apod(PAST)

    assert apod.apod_date == PAST
