from __future__ import annotations

import unicodedata
import uuid
from datetime import datetime
from typing import Any, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.domain.outings.errors import (
    OUTING_DESCRIPTION_TOO_LONG,
    OUTING_ENDS_BEFORE_START,
    OUTING_PLACE_INVALID,
    OUTING_STARTS_IN_PAST,
    OUTING_TITLE_EMPTY,
    OUTING_TITLE_TOO_LONG,
)
from app.domain.shared.errors import ValidationError
from app.domain.shared.location import Location

# TG-629, criterion 1. Same limits as the columns of ``outings``.
TITLE_MAX_LENGTH = 120
DESCRIPTION_MAX_LENGTH = 2000
# TG-661. Same limits as the columns ``place_name`` and ``place_address``.
PLACE_NAME_MAX_LENGTH = 120
PLACE_ADDRESS_MAX_LENGTH = 200

# Control characters, surrogates and private or unassigned code points: no title or
# description needs them, and NUL would make PostgreSQL fail.
_DROPPED_CATEGORIES = ("Cc", "Cs", "Co", "Cn")


def _clean(value: str, keep: str = "") -> str:
    """Drop the characters of ``_DROPPED_CATEGORIES`` (but ``keep``) and the
    surrounding blanks. Never cuts: a text too long is an error, not a shorter text."""
    return "".join(
        char
        for char in value
        if char in keep or unicodedata.category(char) not in _DROPPED_CATEGORIES
    ).strip()


class OutingPlace(BaseModel):
    """The local an outing meets at, when it was chosen from the recommended ones
    (TG-661): its name and address. The coordinates stay in ``Outing.location``.

    The address may be empty (Spotwise says it can be); the name may not.
    """

    model_config = ConfigDict(frozen=True)

    name: str
    address: str = ""

    @field_validator("name", "address")
    @classmethod
    def _check_text(cls, value: str, info: ValidationInfo) -> str:
        cleaned = _clean(value)
        if info.field_name == "name":
            limit, required = PLACE_NAME_MAX_LENGTH, True
        else:
            limit, required = PLACE_ADDRESS_MAX_LENGTH, False
        if (required and not cleaned) or len(cleaned) > limit:
            raise ValidationError(
                OUTING_PLACE_INVALID,
                f"Outing place {info.field_name} must have "
                f"{'1' if required else '0'} to {limit} characters",
            )
        return cleaned


class Outing(BaseModel):
    """An observation outing created by a user to meet others (TG-629).

    Not an astronomical event: it has its own table and never appears in
    ``/api/events``. ``event_id`` optionally links it to the event it is for.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    author_id: uuid.UUID
    title: str
    description: str = ""
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    location: Location
    # The recommended local chosen as ``location``; None for any other place.
    place: OutingPlace | None = None
    event_id: uuid.UUID | None = None
    created_at: AwareDatetime
    updated_at: AwareDatetime

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str) -> str:
        cleaned = _clean(value)
        if not cleaned:
            raise ValidationError(OUTING_TITLE_EMPTY, "Outing title must not be empty")
        if len(cleaned) > TITLE_MAX_LENGTH:
            raise ValidationError(
                OUTING_TITLE_TOO_LONG,
                f"Outing title must have at most {TITLE_MAX_LENGTH} characters",
            )
        return cleaned

    @field_validator("description")
    @classmethod
    def _check_description(cls, value: str) -> str:
        # Line breaks and tabs are kept: a meeting point often needs them.
        cleaned = _clean(value, keep="\n\t")
        if len(cleaned) > DESCRIPTION_MAX_LENGTH:
            raise ValidationError(
                OUTING_DESCRIPTION_TOO_LONG,
                f"Outing description must have at most {DESCRIPTION_MAX_LENGTH} "
                "characters",
            )
        return cleaned

    @model_validator(mode="after")
    def _end_not_before_start(self) -> Self:
        if self.ends_at < self.starts_at:
            raise ValidationError(
                OUTING_ENDS_BEFORE_START, "Outing ends before it starts"
            )
        return self

    def _check_starts_from(self, now: datetime) -> None:
        if self.starts_at < now:
            raise ValidationError(OUTING_STARTS_IN_PAST, "Outing starts in the past")

    @classmethod
    def create(
        cls,
        *,
        author_id: uuid.UUID,
        title: str,
        description: str,
        starts_at: datetime,
        ends_at: datetime,
        location: Location,
        event_id: uuid.UUID | None,
        now: datetime,
        place: OutingPlace | None = None,
    ) -> Outing:
        """Build a new outing of ``author_id``; it may not start before ``now``."""
        outing = cls(
            id=uuid.uuid7(),
            author_id=author_id,
            title=title,
            description=description,
            starts_at=starts_at,
            ends_at=ends_at,
            location=location,
            place=place,
            event_id=event_id,
            created_at=now,
            updated_at=now,
        )
        outing._check_starts_from(now)
        return outing

    def update(self, changes: OutingChanges, *, now: datetime) -> Outing:
        """Return a copy with ``changes`` applied and validated again.

        Only the fields set in ``changes`` change; ``event_id=None`` unlinks the
        event and ``place=None`` clears the place. A new ``location`` without a
        ``place`` clears the old one: its name would not match the coordinates.
        When the dates change, the start may not be before ``now``; when they
        do not, an outing that already started can still be edited.
        """
        fields: dict[str, Any] = self.model_dump()
        fields.update(
            {name: getattr(changes, name) for name in changes.model_fields_set}
        )
        if "location" in changes.model_fields_set and "place" not in (
            changes.model_fields_set
        ):
            fields["place"] = None
        fields["updated_at"] = now
        updated = Outing.model_validate(fields)
        if changes.model_fields_set & {"starts_at", "ends_at"}:
            updated._check_starts_from(now)
        return updated


class OutingChanges(BaseModel):
    """The fields a PATCH sets. A field left out keeps its value."""

    model_config = ConfigDict(frozen=True)

    title: str | None = None
    description: str | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    location: Location | None = None
    place: OutingPlace | None = None
    event_id: uuid.UUID | None = None


class OutingAuthor(BaseModel):
    """What others see of the author of an outing: never the email."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    display_name: str | None = None
    avatar_url: str | None = None


class OutingDetails(BaseModel):
    """An outing together with its author, as the API shows it."""

    model_config = ConfigDict(frozen=True)

    outing: Outing
    author: OutingAuthor
