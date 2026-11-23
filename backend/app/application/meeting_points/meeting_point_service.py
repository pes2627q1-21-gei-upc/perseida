from pydantic import TypeAdapter

from app.application.shared.cache import get_or_load
from app.domain.meeting_points.models import (
    MeetingPointProfile,
    SessionProfile,
    Space,
    recommend,
)
from app.domain.meeting_points.ports import SpaceSearch
from app.domain.shared.location import Location
from app.domain.shared.ports import Cache

# Spotwise asks to cache its answers for a few minutes (contracte-spotwise.md).
CACHE_TTL_SECONDS = 300
# About 100 m: nearby users share the Spotwise call and the cache entry.
_DECIMALS = 3

_SPACES = TypeAdapter(list[Space])


def _rounded(near: Location) -> Location:
    return Location(
        latitude=round(near.latitude, _DECIMALS),
        longitude=round(near.longitude, _DECIMALS),
    )


def _cache_key(profile: MeetingPointProfile, near: Location) -> str:
    return f"meeting_points:{profile.value}:{near.latitude:.3f}:{near.longitude:.3f}"


class MeetingPointService:
    """Meeting points near the user for a profile (TG-352)."""

    def __init__(self, search: SpaceSearch, cache: Cache) -> None:
        self._search = search
        self._cache = cache

    async def recommend(
        self, profile: MeetingPointProfile, near: Location
    ) -> list[Space]:
        """Return the Spotwise spaces near ``near`` that fit ``profile``.

        ``near`` is rounded to 3 decimals; the result is cached 5 minutes.

        Raises:
            ExternalServiceError: MEETING_POINTS_UNAVAILABLE, propagated from
                the search; nothing is cached then.
        """
        rounded = _rounded(near)
        session = SessionProfile.of(profile)

        async def load() -> list[Space]:
            return recommend(await self._search.search(rounded, session), session)

        return await get_or_load(
            self._cache,
            _cache_key(profile, rounded),
            load,
            _SPACES,
            CACHE_TTL_SECONDS,
        )
