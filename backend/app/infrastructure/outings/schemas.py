"""Request and response bodies of ``/api/outings`` (TG-629)."""

from typing import Annotated, Any, Self

from pydantic import (
    UUID7,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    WithJsonSchema,
    model_validator,
)

from app.domain.outings.models import (
    DESCRIPTION_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    OutingDetails,
)
from app.infrastructure.events.schemas import EventLocation, UtcDatetime

# Validated as UUIDv7, published as the standard ``uuid`` format (as EventId).
Uuid7 = Annotated[UUID7, WithJsonSchema({"type": "string", "format": "uuid"})]
Title = Annotated[str, Field(max_length=TITLE_MAX_LENGTH)]
Description = Annotated[str, Field(max_length=DESCRIPTION_MAX_LENGTH)]

_TITLE = f"Títol, d'1 a {TITLE_MAX_LENGTH} caràcters"
_DESCRIPTION = f"Descripció, de 0 a {DESCRIPTION_MAX_LENGTH} caràcters"
_STARTS_AT = "Inici (ISO 8601 amb zona horària); no pot ser en el passat"
_ENDS_AT = "Fi (ISO 8601 amb zona horària); no pot ser anterior a l'inici"
_EVENT_ID = "Esdeveniment astronòmic relacionat; null si no n'hi ha"


class OutingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title = Field(..., description=_TITLE, examples=["Perseides al Montsec"])
    description: Description = Field("", description=_DESCRIPTION)
    starts_at: AwareDatetime = Field(..., description=_STARTS_AT)
    ends_at: AwareDatetime = Field(..., description=_ENDS_AT)
    location: EventLocation = Field(..., description="Lloc de trobada")
    event_id: Uuid7 | None = Field(None, description=_EVENT_ID)


class OutingUpdate(BaseModel):
    """Only the fields sent change. ``event_id: null`` unlinks the event; the other
    fields cannot be null."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = Field(None, description=_TITLE)
    description: Description | None = Field(None, description=_DESCRIPTION)
    starts_at: AwareDatetime | None = Field(None, description=_STARTS_AT)
    ends_at: AwareDatetime | None = Field(None, description=_ENDS_AT)
    location: EventLocation | None = Field(None, description="Lloc de trobada")
    event_id: Uuid7 | None = Field(None, description=_EVENT_ID)

    @model_validator(mode="after")
    def _only_event_id_may_be_null(self) -> Self:
        for name in self.model_fields_set - {"event_id"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class OutingAuthorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Uuid7 = Field(..., description="Identificador de l'autora")
    display_name: str | None = Field(..., description="Nom del perfil de Google")
    avatar_url: str | None = Field(..., description="Avatar del perfil de Google")


class OutingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Uuid7 = Field(..., description="Identificador de la sortida (UUIDv7)")
    title: str = Field(..., description=_TITLE)
    description: str = Field(..., description=_DESCRIPTION)
    starts_at: UtcDatetime = Field(..., description="Inici (ISO 8601, UTC)")
    ends_at: UtcDatetime = Field(..., description="Fi (ISO 8601, UTC)")
    location: EventLocation = Field(..., description="Lloc de trobada")
    event_id: Uuid7 | None = Field(..., description=_EVENT_ID)
    author: OutingAuthorResponse = Field(..., description="Qui ha creat la sortida")
    created_at: UtcDatetime = Field(..., description="Creació (ISO 8601, UTC)")
    updated_at: UtcDatetime = Field(..., description="Última edició (ISO 8601, UTC)")

    @classmethod
    def of(cls, details: OutingDetails) -> OutingResponse:
        outing = details.outing
        fields: dict[str, Any] = outing.model_dump(exclude={"author_id"})
        fields["author"] = details.author.model_dump()
        return cls.model_validate(fields)
