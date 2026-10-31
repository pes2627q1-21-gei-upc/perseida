from enum import StrEnum


class EventCategory(StrEnum):
    """Kinds of astronomical event, as agreed with Spotwise (TG-50, task #387)."""

    LUNAR = "lunar"
    SOLAR = "solar"
    METEOR_SHOWER = "meteor_shower"
    LAUNCH = "launch"
