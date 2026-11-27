import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.application.shared.errors import ForbiddenError
from app.domain.outings.errors import (
    OUTING_EVENT_NOT_FOUND,
    OUTING_FORBIDDEN,
    OUTING_NOT_FOUND,
)
from app.domain.outings.models import (
    Outing,
    OutingChanges,
    OutingDetails,
    OutingPlace,
)
from app.domain.outings.ports import EventLookup, OutingRepository
from app.domain.shared.errors import NotFoundError, ValidationError
from app.domain.shared.location import Location


def _utc_now() -> datetime:
    return datetime.now(UTC)


class OutingService:
    """Observation outings created by users (TG-629).

    Anyone with a session reads them; only the author edits or deletes one.
    """

    def __init__(
        self,
        repository: OutingRepository,
        events: EventLookup,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._repository = repository
        self._events = events
        self._now = now

    async def create(
        self,
        author_id: uuid.UUID,
        *,
        title: str,
        description: str,
        starts_at: datetime,
        ends_at: datetime,
        location: Location,
        event_id: uuid.UUID | None,
        place: OutingPlace | None = None,
    ) -> OutingDetails:
        """Create an outing of ``author_id``, optionally for ``event_id`` and at
        the recommended local ``place``."""
        outing = Outing.create(
            author_id=author_id,
            title=title,
            description=description,
            starts_at=starts_at,
            ends_at=ends_at,
            location=location,
            event_id=event_id,
            place=place,
            now=self._now(),
        )
        await self._check_event(event_id)
        await self._repository.add(outing)
        return await self.get(outing.id)

    async def list_upcoming(
        self,
        *,
        event_id: uuid.UUID | None = None,
        author_id: uuid.UUID | None = None,
    ) -> list[OutingDetails]:
        """Return the outings that have not started, sorted by start."""
        return await self._repository.list_upcoming(
            self._now(), event_id=event_id, author_id=author_id
        )

    async def get(self, outing_id: uuid.UUID) -> OutingDetails:
        """Return the outing with its author.

        Raises:
            NotFoundError: there is no such outing.
        """
        details = await self._repository.get(outing_id)
        if details is None:
            raise NotFoundError(OUTING_NOT_FOUND, "Outing not found")
        return details

    async def update(
        self, user_id: uuid.UUID, outing_id: uuid.UUID, changes: OutingChanges
    ) -> OutingDetails:
        """Apply ``changes`` to an outing of ``user_id``.

        Raises:
            NotFoundError: there is no such outing.
            ForbiddenError: ``user_id`` is not its author.
        """
        details = await self._own_outing(user_id, outing_id)
        updated = details.outing.update(changes, now=self._now())
        if "event_id" in changes.model_fields_set:
            await self._check_event(changes.event_id)
        await self._repository.save(updated)
        # The author does not change: no need to read the outing again.
        return OutingDetails(outing=updated, author=details.author)

    async def delete(self, user_id: uuid.UUID, outing_id: uuid.UUID) -> None:
        """Delete an outing of ``user_id``.

        Raises:
            NotFoundError: there is no such outing.
            ForbiddenError: ``user_id`` is not its author.
        """
        await self._own_outing(user_id, outing_id)
        await self._repository.delete(outing_id)

    async def _own_outing(
        self, user_id: uuid.UUID, outing_id: uuid.UUID
    ) -> OutingDetails:
        details = await self.get(outing_id)
        if details.outing.author_id != user_id:
            raise ForbiddenError(
                OUTING_FORBIDDEN, "Only the author may change the outing"
            )
        return details

    async def _check_event(self, event_id: uuid.UUID | None) -> None:
        if event_id is not None and not await self._events.exists(event_id):
            raise ValidationError(OUTING_EVENT_NOT_FOUND, "Event not found")
