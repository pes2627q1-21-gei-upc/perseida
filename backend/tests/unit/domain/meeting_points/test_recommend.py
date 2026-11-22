"""Meeting point profiles and the Perseida-side filter (TG-352)."""

from typing import Any

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError as PydanticValidationError

from app.domain.meeting_points.models import (
    MeetingPointProfile,
    PlugLevel,
    SessionProfile,
    SilenceLevel,
    Space,
    SpaceType,
    recommend,
)
from app.domain.shared.location import Location
from tests.factories.meeting_points import (
    EXAMPLE_SPACES,
    LIBRARY_12,
    STUDY_ROOM_31,
    make_space,
)

WATCH_PARTY = SessionProfile.of(MeetingPointProfile.WATCH_PARTY)
STUDY = SessionProfile.of(MeetingPointProfile.STUDY)


def _profile(**overrides: Any) -> SessionProfile:
    # Keeps everything unless a field is overridden.
    fields: dict[str, Any] = {
        "group": None,
        "silence": frozenset(),
        "plugs": frozenset(),
        "wifi_required": False,
        "max_distance_m": 1500,
    }
    fields.update(overrides)
    return SessionProfile(**fields)


def _ids(spaces: list[Space]) -> list[int]:
    return [space.id for space in spaces]


# --- enums ----------------------------------------------------------------------


def test_tg352_enum_values_are_the_api_ones() -> None:
    assert [p.value for p in MeetingPointProfile] == ["watch_party", "study"]
    assert [t.value for t in SpaceType] == ["library", "cafe", "other"]
    assert [s.value for s in SilenceLevel] == ["silent", "murmur", "noisy"]
    assert [p.value for p in PlugLevel] == ["many", "few", "none"]


# --- SessionProfile.of ----------------------------------------------------------


def test_tg352_c4_watch_party_profile_asks_for_groups_and_wifi() -> None:
    # TG-352 criteri 4: watch party = apte per a grup, amb wifi, a <= 1.500 m
    assert SessionProfile.of(MeetingPointProfile.WATCH_PARTY) == SessionProfile(
        group=True,
        silence=frozenset(),
        plugs=frozenset(),
        wifi_required=True,
        max_distance_m=1500,
    )


def test_tg352_c4_study_profile_asks_for_silence_and_plugs() -> None:
    # TG-352 criteri 4: estudi = silenciós, amb endolls (molts o pocs), a <= 1.500 m
    assert SessionProfile.of(MeetingPointProfile.STUDY) == SessionProfile(
        group=None,
        silence=frozenset({SilenceLevel.SILENT}),
        plugs=frozenset({PlugLevel.MANY, PlugLevel.FEW}),
        wifi_required=False,
        max_distance_m=1500,
    )


def test_tg352_an_unknown_profile_is_rejected() -> None:
    with pytest.raises(AssertionError):
        SessionProfile.of("party")  # type: ignore[arg-type]


def test_tg352_a_negative_distance_is_rejected() -> None:
    with pytest.raises(PydanticValidationError):
        make_space(distance_m=-1)
    assert make_space(distance_m=0).distance_m == 0


def test_tg352_profile_and_space_are_frozen() -> None:
    with pytest.raises(PydanticValidationError):
        STUDY.max_distance_m = 10  # type: ignore[misc]
    with pytest.raises(PydanticValidationError):
        LIBRARY_12.name = "Una altra"  # type: ignore[misc]


# --- recommend: distance --------------------------------------------------------


@pytest.mark.parametrize(
    ("distance_m", "kept"),
    [(0, True), (1499, True), (1500, True), (1501, False), (None, False)],
)
def test_tg352_c4_keeps_only_spaces_within_the_max_distance(
    distance_m: int | None, kept: bool
) -> None:
    space = make_space(distance_m=distance_m)

    assert recommend([space], _profile()) == ([space] if kept else [])


# --- recommend: wifi ------------------------------------------------------------


@pytest.mark.parametrize(("wifi", "kept"), [(True, True), (False, False)])
def test_tg352_c4_wifi_required_drops_spaces_without_wifi(
    wifi: bool, kept: bool
) -> None:
    space = make_space(wifi=wifi)

    assert recommend([space], _profile(wifi_required=True)) == ([space] if kept else [])


def test_tg352_wifi_not_required_keeps_spaces_without_wifi() -> None:
    space = make_space(wifi=False)

    assert recommend([space], _profile(wifi_required=False)) == [space]


# --- recommend: group -----------------------------------------------------------


@pytest.mark.parametrize(
    ("group_friendly", "kept"), [(True, True), (False, False), (None, False)]
)
def test_tg352_c4_group_profile_keeps_only_confirmed_group_spaces(
    group_friendly: bool | None, kept: bool
) -> None:
    space = make_space(group_friendly=group_friendly)

    assert recommend([space], _profile(group=True)) == ([space] if kept else [])


@pytest.mark.parametrize("group_friendly", [True, False, None])
def test_tg352_without_group_profile_group_is_not_filtered(
    group_friendly: bool | None,
) -> None:
    space = make_space(group_friendly=group_friendly)

    assert recommend([space], _profile(group=None)) == [space]


# --- recommend: silence ---------------------------------------------------------


@pytest.mark.parametrize(
    ("silence", "kept"),
    [
        (SilenceLevel.SILENT, True),
        (SilenceLevel.MURMUR, False),
        (SilenceLevel.NOISY, False),
        (None, False),
    ],
)
def test_tg352_c4_silence_profile_keeps_only_confirmed_matching_spaces(
    silence: SilenceLevel | None, kept: bool
) -> None:
    space = make_space(silence=silence)
    profile = _profile(silence=frozenset({SilenceLevel.SILENT}))

    assert recommend([space], profile) == ([space] if kept else [])


@pytest.mark.parametrize("silence", [*SilenceLevel, None])
def test_tg352_without_silence_profile_silence_is_not_filtered(
    silence: SilenceLevel | None,
) -> None:
    space = make_space(silence=silence)

    assert recommend([space], _profile()) == [space]


# --- recommend: plugs -----------------------------------------------------------


@pytest.mark.parametrize("plugs", [*PlugLevel, None])
def test_tg352_c4_plugs_never_filter_in_perseida(plugs: PlugLevel | None) -> None:
    # Plugs only go to Spotwise as a preference.
    space = make_space(plugs=plugs)
    profile = _profile(plugs=frozenset({PlugLevel.MANY, PlugLevel.FEW}))

    assert recommend([space], profile) == [space]


# --- recommend: order and examples ----------------------------------------------


def test_tg352_c4_keeps_the_spotwise_order() -> None:
    far = make_space(id=1, distance_m=1400)
    dropped = make_space(id=2, wifi=False)
    near = make_space(id=3, distance_m=10)
    middle = make_space(id=4, distance_m=700)

    result = recommend([far, dropped, near, middle], _profile(wifi_required=True))

    assert _ids(result) == [1, 3, 4]


def test_tg352_empty_input_gives_empty_output() -> None:
    assert recommend([], WATCH_PARTY) == []


def test_tg352_c4_watch_party_on_the_spotwise_example_keeps_only_space_12() -> None:
    assert recommend(EXAMPLE_SPACES, WATCH_PARTY) == [LIBRARY_12]


def test_tg352_c4_study_on_the_spotwise_example_keeps_nothing() -> None:
    # 12 is "murmuri" and 31 has no silence votes (null).
    assert recommend(EXAMPLE_SPACES, STUDY) == []


def test_tg352_c4_study_keeps_a_silent_space_without_wifi_nor_group() -> None:
    space = STUDY_ROOM_31.model_copy(
        update={"silence": SilenceLevel.SILENT, "wifi": False}
    )

    assert recommend([space], STUDY) == [space]


# --- property -------------------------------------------------------------------

_spaces = st.builds(
    Space,
    id=st.integers(min_value=1, max_value=10_000),
    name=st.just("Espai"),
    type=st.sampled_from(SpaceType),
    address=st.just(""),
    location=st.just(Location(latitude=41.39, longitude=2.17)),
    wifi=st.booleans(),
    silence=st.none() | st.sampled_from(SilenceLevel),
    plugs=st.none() | st.sampled_from(PlugLevel),
    group_friendly=st.none() | st.booleans(),
    distance_m=st.none() | st.integers(min_value=0, max_value=3000),
    open_now=st.none() | st.booleans(),
)
_profiles = st.builds(
    SessionProfile,
    group=st.none() | st.just(True),
    silence=st.frozensets(st.sampled_from(SilenceLevel)),
    plugs=st.frozensets(st.sampled_from(PlugLevel)),
    wifi_required=st.booleans(),
    max_distance_m=st.integers(min_value=0, max_value=3000),
)


def _matches(space: Space, profile: SessionProfile) -> bool:
    return (
        space.distance_m is not None
        and space.distance_m <= profile.max_distance_m
        and (not profile.wifi_required or space.wifi is True)
        and (profile.group is not True or space.group_friendly is True)
        and (not profile.silence or space.silence in profile.silence)
    )


@given(spaces=st.lists(_spaces, max_size=12), profile=_profiles)
def test_tg352_recommend_is_the_ordered_subsequence_of_matching_spaces(
    spaces: list[Space], profile: SessionProfile
) -> None:
    assert recommend(spaces, profile) == [s for s in spaces if _matches(s, profile)]
