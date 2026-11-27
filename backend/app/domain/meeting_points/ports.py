from typing import Protocol

from app.domain.meeting_points.models import SessionProfile, Space
from app.domain.shared.location import Location


class SpaceSearch(Protocol):
    """Spaces near a point that Spotwise finds for a session profile (TG-352)."""

    async def search(self, near: Location, profile: SessionProfile) -> list[Space]:
        """Return the spaces Spotwise finds near ``near``, in its order.

        Spaces that do not confirm an attribute of ``profile`` may come too
        (with that attribute ``None``): the caller filters them.

        Raises:
            ExternalServiceError: MEETING_POINTS_UNAVAILABLE if Spotwise fails.
        """
        ...
