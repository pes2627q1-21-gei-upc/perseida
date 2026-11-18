import uuid
from datetime import datetime
from typing import Protocol

from app.domain.outings.models import Outing, OutingDetails


class OutingRepository(Protocol):
    """Stored observation outings (TG-629). ``now`` must be timezone-aware."""

    async def get(self, outing_id: uuid.UUID) -> OutingDetails | None:
        """Return the outing and its author, or None if it does not exist."""
        ...

    async def add(self, outing: Outing) -> None:
        """Store a new outing."""
        ...

    async def save(self, outing: Outing) -> None:
        """Store the new values of an existing outing."""
        ...

    async def delete(self, outing_id: uuid.UUID) -> None:
        """Remove the outing; nothing happens if it does not exist."""
        ...

    async def list_upcoming(
        self,
        now: datetime,
        *,
        event_id: uuid.UUID | None = None,
        author_id: uuid.UUID | None = None,
    ) -> list[OutingDetails]:
        """Return the outings with ``starts_at >= now``, sorted by ``starts_at`` and
        then ``id``, optionally only those of ``event_id`` or of ``author_id``."""
        ...


class EventLookup(Protocol):
    """Whether an astronomical event exists. An outing only points to an event by
    id, so it needs nothing else from the events feature."""

    async def exists(self, event_id: uuid.UUID) -> bool:
        """Return whether an event with ``event_id`` is stored."""
        ...
