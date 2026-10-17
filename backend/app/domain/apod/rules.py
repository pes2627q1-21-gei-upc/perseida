from datetime import date

from app.domain.shared.errors import ValidationError

# The APOD service started on 1995-06-16; there is nothing earlier.
FIRST_APOD_DATE = date(1995, 6, 16)


def ensure_requestable(day: date, today: date) -> None:
    """Check that an APOD can exist for ``day``.

    Raises:
        ValidationError: code APOD_DATE_IN_FUTURE if ``day`` is after ``today``.
        ValidationError: code APOD_DATE_BEFORE_START if ``day`` is before
            ``FIRST_APOD_DATE``.
    """
    if day > today:
        raise ValidationError(
            "APOD_DATE_IN_FUTURE", f"APOD date {day} is in the future"
        )
    if day < FIRST_APOD_DATE:
        raise ValidationError(
            "APOD_DATE_BEFORE_START",
            f"APOD date {day} is before the first APOD ({FIRST_APOD_DATE})",
        )
