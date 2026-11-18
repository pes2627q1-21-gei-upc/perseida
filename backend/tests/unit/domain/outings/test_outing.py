import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError as PydanticValidationError

from app.domain.outings.errors import (
    OUTING_DESCRIPTION_TOO_LONG,
    OUTING_ENDS_BEFORE_START,
    OUTING_STARTS_IN_PAST,
    OUTING_TITLE_EMPTY,
    OUTING_TITLE_TOO_LONG,
)
from app.domain.outings.models import (
    DESCRIPTION_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    Outing,
    OutingChanges,
)
from app.domain.shared.errors import ValidationError
from app.domain.shared.location import Location

NOW = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)
AUTHOR_ID = uuid.uuid7()
EVENT_ID = uuid.uuid7()
MONTSEC = Location(latitude=42.0517, longitude=0.7296)


def _create(**overrides: Any) -> Outing:
    fields: dict[str, Any] = {
        "author_id": AUTHOR_ID,
        "title": "Perseides al Montsec",
        "description": "Portem cadires i termos.",
        "starts_at": NOW + timedelta(days=1),
        "ends_at": NOW + timedelta(days=1, hours=3),
        "location": MONTSEC,
        "event_id": None,
        "now": NOW,
    }
    fields.update(overrides)
    return Outing.create(**fields)


def _code(error: pytest.ExceptionInfo[ValidationError]) -> str:
    return error.value.code


# --- create ---------------------------------------------------------------------


def test_create_keeps_the_fields_and_the_author() -> None:
    # TG-629 criteri 1: la sortida és de la usuària autenticada
    outing = _create(event_id=EVENT_ID)

    assert outing.author_id == AUTHOR_ID
    assert outing.title == "Perseides al Montsec"
    assert outing.description == "Portem cadires i termos."
    assert outing.starts_at == NOW + timedelta(days=1)
    assert outing.ends_at == NOW + timedelta(days=1, hours=3)
    assert outing.location == MONTSEC
    assert outing.event_id == EVENT_ID


def test_create_generates_a_uuid_v7_and_stamps_both_dates_with_now() -> None:
    # ADR-0023: id UUIDv7; el servidor posa created_at i updated_at
    outing = _create()

    assert outing.id.version == 7
    assert _create().id != outing.id
    assert outing.created_at == NOW
    assert outing.updated_at == NOW


def test_event_is_optional() -> None:
    # TG-629 criteri 1: l'esdeveniment relacionat és opcional
    assert _create().event_id is None


def test_description_is_optional() -> None:
    # TG-629 criteri 1: descripció de 0 a 2.000 caràcters
    assert _create(description="").description == ""


# --- dates ----------------------------------------------------------------------


def test_start_in_the_past_is_rejected() -> None:
    # TG-629 criteri 1: l'inici no pot ser en el passat
    with pytest.raises(ValidationError) as error:
        _create(starts_at=NOW - timedelta(minutes=1), ends_at=NOW + timedelta(hours=1))

    assert _code(error) == OUTING_STARTS_IN_PAST


def test_start_exactly_now_is_accepted() -> None:
    # El límit: «en el passat» vol dir abans d'ara
    assert _create(starts_at=NOW, ends_at=NOW).starts_at == NOW


def test_end_before_start_is_rejected() -> None:
    # TG-629 criteri 1: la fi no pot ser anterior a l'inici
    start = NOW + timedelta(days=1)
    with pytest.raises(ValidationError) as error:
        _create(starts_at=start, ends_at=start - timedelta(seconds=1))

    assert _code(error) == OUTING_ENDS_BEFORE_START


def test_end_equal_to_start_is_accepted() -> None:
    start = NOW + timedelta(days=1)

    assert _create(starts_at=start, ends_at=start).ends_at == start


@given(
    start_offset=st.integers(min_value=0, max_value=10**8),
    duration=st.integers(min_value=-(10**8), max_value=10**8),
)
def test_end_is_never_before_start(start_offset: int, duration: int) -> None:
    # Propietat: tota sortida creada té ends_at >= starts_at
    start = NOW + timedelta(seconds=start_offset)
    end = start + timedelta(seconds=duration)
    try:
        outing = _create(starts_at=start, ends_at=end)
    except ValidationError as error:
        assert duration < 0
        assert error.code == OUTING_ENDS_BEFORE_START
    else:
        assert outing.ends_at >= outing.starts_at


def test_naive_dates_are_rejected() -> None:
    # TG-629 criteri 1: ISO 8601 amb zona horària
    with pytest.raises(PydanticValidationError):
        _create(
            starts_at=datetime(2026, 12, 1, 22, 0),
            ends_at=datetime(2026, 12, 1, 23, 0),
        )


# --- location -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(-90.0, -180.0), (90.0, 180.0), (0.0, 0.0)],
)
def test_location_limits_are_accepted(latitude: float, longitude: float) -> None:
    location = Location(latitude=latitude, longitude=longitude)

    assert _create(location=location).location == location


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(-90.01, 0.0), (90.01, 0.0), (0.0, -180.01), (0.0, 180.01)],
)
def test_location_out_of_range_is_rejected(latitude: float, longitude: float) -> None:
    # TG-629 criteri 1: latitud −90..90 i longitud −180..180
    with pytest.raises(PydanticValidationError):
        _create(location={"latitude": latitude, "longitude": longitude})


def test_location_is_required() -> None:
    # TG-629 criteri 1: ubicació obligatòria
    with pytest.raises(PydanticValidationError):
        _create(location=None)


# --- texts ----------------------------------------------------------------------


def test_title_is_trimmed_and_control_characters_are_dropped() -> None:
    assert _create(title="  Lluna\x00 plena\x07  ").title == "Lluna plena"


@pytest.mark.parametrize("title", ["", "   ", "\x00\x07"])
def test_blank_title_is_rejected(title: str) -> None:
    # TG-629 criteri 1: títol d'1 a 120 caràcters
    with pytest.raises(ValidationError) as error:
        _create(title=title)

    assert _code(error) == OUTING_TITLE_EMPTY


def test_title_of_max_length_is_accepted() -> None:
    title = "a" * TITLE_MAX_LENGTH

    assert _create(title=title).title == title


def test_title_over_max_length_is_rejected_not_cut() -> None:
    with pytest.raises(ValidationError) as error:
        _create(title="a" * (TITLE_MAX_LENGTH + 1))

    assert _code(error) == OUTING_TITLE_TOO_LONG


def test_description_keeps_line_breaks_and_drops_other_controls() -> None:
    description = "  Punt de trobada:\n\tpàrquing\x00 de dalt\x1b  "

    assert _create(description=description).description == (
        "Punt de trobada:\n\tpàrquing de dalt"
    )


def test_description_of_max_length_is_accepted() -> None:
    description = "a" * DESCRIPTION_MAX_LENGTH

    assert _create(description=description).description == description


def test_description_over_max_length_is_rejected_not_cut() -> None:
    # TG-629 criteri 1: descripció de 0 a 2.000 caràcters
    with pytest.raises(ValidationError) as error:
        _create(description="a" * (DESCRIPTION_MAX_LENGTH + 1))

    assert _code(error) == OUTING_DESCRIPTION_TOO_LONG


def test_limits_match_the_acceptance_criteria() -> None:
    assert TITLE_MAX_LENGTH == 120
    assert DESCRIPTION_MAX_LENGTH == 2000


def test_outing_is_immutable() -> None:
    outing = _create()

    with pytest.raises(PydanticValidationError):
        outing.title = "Un altre"  # type: ignore[misc]


# --- update ---------------------------------------------------------------------

LATER = NOW + timedelta(hours=2)


def test_update_changes_only_the_given_fields_and_stamps_updated_at() -> None:
    outing = _create(event_id=EVENT_ID)

    updated = outing.update(OutingChanges(title="Nou títol"), now=LATER)

    assert updated.title == "Nou títol"
    assert updated.description == outing.description
    assert updated.event_id == EVENT_ID
    assert updated.id == outing.id
    assert updated.author_id == outing.author_id
    assert updated.created_at == outing.created_at
    assert updated.updated_at == LATER


def test_update_can_unlink_the_event_with_an_explicit_null() -> None:
    outing = _create(event_id=EVENT_ID)

    assert outing.update(OutingChanges(event_id=None), now=LATER).event_id is None


def test_update_without_event_id_keeps_the_event() -> None:
    outing = _create(event_id=EVENT_ID)

    assert outing.update(OutingChanges(), now=LATER).event_id == EVENT_ID


def test_update_validates_the_texts_again() -> None:
    with pytest.raises(ValidationError) as error:
        _create().update(OutingChanges(title="  "), now=LATER)

    assert _code(error) == OUTING_TITLE_EMPTY


def test_update_checks_end_against_the_current_start() -> None:
    outing = _create()

    with pytest.raises(ValidationError) as error:
        outing.update(
            OutingChanges(ends_at=outing.starts_at - timedelta(minutes=1)), now=LATER
        )

    assert _code(error) == OUTING_ENDS_BEFORE_START


def test_update_of_dates_rejects_a_start_in_the_past() -> None:
    # Decisió de Raquel (17/11/2026): la regla s'aplica si el PATCH canvia les dates
    outing = _create(
        starts_at=NOW + timedelta(hours=1), ends_at=NOW + timedelta(hours=4)
    )
    much_later = NOW + timedelta(hours=2)

    with pytest.raises(ValidationError) as error:
        outing.update(OutingChanges(ends_at=NOW + timedelta(hours=5)), now=much_later)

    assert _code(error) == OUTING_STARTS_IN_PAST


def test_update_without_dates_is_allowed_after_the_start() -> None:
    # Decisió de Raquel (17/11/2026): si no canvien les dates, es pot editar
    outing = _create(
        starts_at=NOW + timedelta(hours=1), ends_at=NOW + timedelta(hours=4)
    )
    much_later = NOW + timedelta(hours=2)

    updated = outing.update(OutingChanges(title="Ja hem arribat"), now=much_later)

    assert updated.title == "Ja hem arribat"


def test_update_does_not_change_the_original() -> None:
    outing = _create()

    outing.update(OutingChanges(title="Nou títol"), now=LATER)

    assert outing.title == "Perseides al Montsec"
