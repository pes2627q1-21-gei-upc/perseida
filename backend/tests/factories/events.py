import uuid
from datetime import datetime

from app.domain.events.models import AstronomicalEvent, EventCategory, Location


def make_event(
    starts_at: datetime,
    ends_at: datetime | None = None,
    location: Location | None = None,
) -> AstronomicalEvent:
    """An event that is instantaneous unless ``ends_at`` is given."""
    return AstronomicalEvent(
        id=uuid.uuid7(),
        title=f"Event {starts_at.isoformat()}",
        summary="An astronomical event.",
        category=EventCategory.LUNAR,
        starts_at=starts_at,
        ends_at=starts_at if ends_at is None else ends_at,
        location=location,
        source_url=None,
    )
