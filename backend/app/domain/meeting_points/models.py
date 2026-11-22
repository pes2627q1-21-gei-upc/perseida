"""Meeting points recommended from the Spotwise spaces (TG-352).

Spotwise searches the spaces near a point with the session profile; Perseida
keeps only those that confirm what the profile needs (contracte-spotwise.md).
"""

from collections.abc import Iterable
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict

from app.domain.shared.location import Location

MAX_DISTANCE_M = 1500


class MeetingPointProfile(StrEnum):
    """What the meeting is for."""

    WATCH_PARTY = "watch_party"
    STUDY = "study"


class SpaceType(StrEnum):
    LIBRARY = "library"
    CAFE = "cafe"
    OTHER = "other"


class SilenceLevel(StrEnum):
    SILENT = "silent"
    MURMUR = "murmur"
    NOISY = "noisy"


class PlugLevel(StrEnum):
    MANY = "many"
    FEW = "few"
    NONE = "none"


class SessionProfile(BaseModel):
    """What a meeting needs from a space.

    ``group``, ``silence`` and ``plugs`` are sent to Spotwise; an empty set or
    ``None`` means "any". Perseida then keeps the spaces that confirm ``group``
    and ``silence`` (plugs are only a preference), have wifi when
    ``wifi_required`` and are at most ``max_distance_m`` away.
    """

    model_config = ConfigDict(frozen=True)

    group: bool | None
    silence: frozenset[SilenceLevel]
    plugs: frozenset[PlugLevel]
    wifi_required: bool
    max_distance_m: int

    @classmethod
    def of(cls, profile: MeetingPointProfile) -> Self:
        """The session profile agreed with Spotwise for ``profile``."""
        if profile is MeetingPointProfile.WATCH_PARTY:
            return cls(
                group=True,
                silence=frozenset(),
                plugs=frozenset(),
                wifi_required=True,
                max_distance_m=MAX_DISTANCE_M,
            )
        return cls(
            group=None,
            silence=frozenset({SilenceLevel.SILENT}),
            plugs=frozenset({PlugLevel.MANY, PlugLevel.FEW}),
            wifi_required=False,
            max_distance_m=MAX_DISTANCE_M,
        )


class Space(BaseModel):
    """A Spotwise space. ``None`` means nobody voted it (or, for ``distance_m``,
    that no location was sent; for ``open_now``, that the hours are unknown)."""

    model_config = ConfigDict(frozen=True)

    id: int
    name: str
    type: SpaceType
    address: str
    location: Location
    wifi: bool
    silence: SilenceLevel | None
    plugs: PlugLevel | None
    group_friendly: bool | None
    distance_m: int | None
    open_now: bool | None


def _matches(space: Space, profile: SessionProfile) -> bool:
    if space.distance_m is None or space.distance_m > profile.max_distance_m:
        return False
    if profile.wifi_required and not space.wifi:
        return False
    if profile.group is True and space.group_friendly is not True:
        return False
    return not profile.silence or space.silence in profile.silence


def recommend(spaces: Iterable[Space], profile: SessionProfile) -> list[Space]:
    """The spaces that fit ``profile``, in the order Spotwise gave them."""
    return [space for space in spaces if _matches(space, profile)]
