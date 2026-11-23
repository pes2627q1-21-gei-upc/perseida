from collections.abc import Iterable

from app.domain.meeting_points.models import SessionProfile, Space
from app.domain.shared.location import Location


class FakeSpaceSearch:
    """In-memory SpaceSearch. Records each call; raises ``failure`` if given."""

    def __init__(
        self, spaces: Iterable[Space] = (), failure: Exception | None = None
    ) -> None:
        self._spaces = list(spaces)
        self.failure = failure
        self.calls: list[tuple[Location, SessionProfile]] = []

    async def search(self, near: Location, profile: SessionProfile) -> list[Space]:
        self.calls.append((near, profile))
        if self.failure is not None:
            raise self.failure
        return list(self._spaces)
