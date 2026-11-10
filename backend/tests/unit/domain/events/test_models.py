from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.events.models import EventDraft, EventSourceName, Location
from app.domain.shared.errors import ValidationError
from tests.factories.events import make_draft, make_event

START = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)


def test_tg351_event_may_be_instantaneous_and_without_location() -> None:
    event = make_event(START)

    assert event.ends_at == event.starts_at
    assert event.location is None


def test_tg351_event_keeps_its_location() -> None:
    event = make_event(START, location=Location(latitude=28.5618, longitude=-80.577))

    assert event.location == Location(latitude=28.5618, longitude=-80.577)


def test_tg351_event_cannot_end_before_it_starts() -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_event(START, START - timedelta(seconds=1))

    assert exc_info.value.code == "EVENT_ENDS_BEFORE_START"


def test_tg351_event_dates_need_a_time_zone() -> None:
    with pytest.raises(PydanticValidationError):
        make_event(datetime(2026, 11, 17, 21, 0))


@pytest.mark.parametrize(
    ("latitude", "longitude"), [(90.1, 0), (-90.1, 0), (0, 180.1), (0, -180.1)]
)
def test_tg351_location_must_be_on_earth(latitude: float, longitude: float) -> None:
    with pytest.raises(PydanticValidationError):
        Location(latitude=latitude, longitude=longitude)


def test_tg50_c4_draft_keeps_its_source_and_external_id() -> None:
    draft = make_draft(START, external_id="abc")

    assert draft.source == EventSourceName.LAUNCH_LIBRARY_2
    assert draft.external_id == "abc"


def test_tg50_c3_draft_cannot_end_before_it_starts() -> None:
    with pytest.raises(ValidationError) as exc_info:
        EventDraft.model_validate(
            make_draft(START).model_dump() | {"ends_at": START - timedelta(seconds=1)}
        )

    assert exc_info.value.code == "EVENT_ENDS_BEFORE_START"


@pytest.mark.parametrize("field", ["external_id", "title", "summary"])
def test_tg50_c3_draft_needs_non_blank_text(field: str) -> None:
    with pytest.raises(PydanticValidationError):
        EventDraft.model_validate(make_draft(START).model_dump() | {field: "  "})
