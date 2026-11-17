import uuid
from collections.abc import Iterable
from datetime import datetime

from app.domain.outings.models import Outing, OutingAuthor, OutingDetails


class FakeOutingRepository:
    """In-memory OutingRepository. ``authors`` are the users the join would find."""

    def __init__(self, authors: Iterable[OutingAuthor] = ()) -> None:
        self.outings: dict[uuid.UUID, Outing] = {}
        self._authors = {author.id: author for author in authors}

    def _details(self, outing: Outing) -> OutingDetails:
        return OutingDetails(outing=outing, author=self._authors[outing.author_id])

    async def get(self, outing_id: uuid.UUID) -> OutingDetails | None:
        outing = self.outings.get(outing_id)
        return None if outing is None else self._details(outing)

    async def add(self, outing: Outing) -> None:
        self.outings[outing.id] = outing

    async def save(self, outing: Outing) -> None:
        self.outings[outing.id] = outing

    async def delete(self, outing_id: uuid.UUID) -> None:
        self.outings.pop(outing_id, None)

    async def list_upcoming(
        self,
        now: datetime,
        *,
        event_id: uuid.UUID | None = None,
        author_id: uuid.UUID | None = None,
    ) -> list[OutingDetails]:
        outings = [
            outing
            for outing in self.outings.values()
            if outing.starts_at >= now
            and (event_id is None or outing.event_id == event_id)
            and (author_id is None or outing.author_id == author_id)
        ]
        outings.sort(key=lambda outing: (outing.starts_at, outing.id))
        return [self._details(outing) for outing in outings]
