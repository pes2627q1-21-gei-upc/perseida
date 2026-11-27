"""Stable error codes of the events feature (ADR-0018)."""

# The event asked for is not stored (TG-53, criterion 5).
EVENT_NOT_FOUND = "EVENT_NOT_FOUND"
# A new subscription to an event whose ``ends_at`` is already past (TG-53,
# criterion 5).
EVENT_ALREADY_ENDED = "EVENT_ALREADY_ENDED"
