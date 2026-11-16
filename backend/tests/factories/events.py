import uuid
from datetime import datetime, timedelta

from app.domain.events.models import (
    AstronomicalEvent,
    EventCategory,
    EventDraft,
    EventSourceName,
    Location,
)


def make_draft(
    starts_at: datetime,
    external_id: str = "launch-1",
    title: str = "Falcon 9 | Starlink",
    source: EventSourceName = EventSourceName.LAUNCH_LIBRARY_2,
) -> EventDraft:
    """A launch draft, as a source returns it, lasting two hours."""
    return EventDraft(
        source=source,
        external_id=external_id,
        title=title,
        summary="A batch of satellites.",
        category=EventCategory.LAUNCH,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        location=Location(latitude=28.5618, longitude=-80.577),
        source_url="https://ll.thespacedevs.com/2.3.0/launches/launch-1/",
    )


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
