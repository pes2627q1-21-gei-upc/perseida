"""Public event DTO: the contract shared with #351, #52 and Spotwise (task #387).

Any change here changes the contract: it must be notified to Spotwise
(vault: arquitectura/contracte-esdeveniments).
"""

from datetime import UTC
from typing import Annotated, Self

from pydantic import (
    UUID7,
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    WithJsonSchema,
    model_validator,
)

from app.domain.events.models import EventCategory
from app.domain.shared.text import safe_https_url


def _require_https(value: str | None) -> str | None:
    if value is None:
        return None
    url = safe_https_url(value)
    if url is None:
        raise ValueError("source_url must be a plain https URL")
    return url


UtcDatetime = Annotated[AwareDatetime, AfterValidator(lambda v: v.astimezone(UTC))]
# UUIDv7 is validated, but published as the standard ``uuid`` format so that
# generated clients (openapi-typescript, schemathesis) understand it.
EventId = Annotated[UUID7, WithJsonSchema({"type": "string", "format": "uuid"})]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class EventLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(..., ge=-90, le=90, examples=[28.5618])
    longitude: float = Field(..., ge=-180, le=180, examples=[-80.577])


class EventResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: EventId = Field(
        ..., description="Identificador estable de l'esdeveniment (UUIDv7)"
    )
    title: Text = Field(..., description="Títol, en l'idioma de la font")
    summary: Text = Field(..., description="Descripció breu, en l'idioma de la font")
    category: EventCategory = Field(..., description="Tipus d'esdeveniment")
    starts_at: UtcDatetime = Field(..., description="Inici (ISO 8601, UTC)")
    ends_at: UtcDatetime = Field(
        ..., description="Fi (ISO 8601, UTC); igual a l'inici si és instantani"
    )
    location: EventLocation | None = Field(
        ..., description="Ubicació concreta; null si és visible des de qualsevol lloc"
    )
    source_url: Annotated[str | None, AfterValidator(_require_https)] = Field(
        ..., description="Enllaç a la font (només https); null si no n'hi ha"
    )

    @model_validator(mode="after")
    def _end_not_before_start(self) -> Self:
        if self.ends_at < self.starts_at:
            raise ValueError("ends_at must not be before starts_at")
        return self
