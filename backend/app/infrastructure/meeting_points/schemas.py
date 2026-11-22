"""Response body of ``GET /api/meeting-points`` (TG-352)."""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field

from app.domain.meeting_points.models import PlugLevel, SilenceLevel, Space, SpaceType
from app.infrastructure.events.schemas import EventLocation


class MeetingPointResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int = Field(..., description="Identificador estable de l'espai a Spotwise")
    name: str = Field(..., description="Nom de l'espai")
    type: SpaceType = Field(..., description="Tipus d'espai")
    address: str = Field(..., description="Adreça; pot ser buida")
    location: EventLocation = Field(..., description="Ubicació de l'espai")
    wifi: bool = Field(..., description="Si té wifi públic")
    silence_level: SilenceLevel | None = Field(
        ..., description="Nivell de silenci més votat; null si ningú l'ha votat"
    )
    plugs: PlugLevel | None = Field(
        ..., description="Endolls disponibles més votats; null si ningú els ha votat"
    )
    group_friendly: bool | None = Field(
        ..., description="Si és apte per a grups; null si ningú l'ha votat"
    )
    distance_m: int = Field(
        ...,
        description=(
            "Distància en metres des de la ubicació de la petició arrodonida a "
            "3 decimals (fins a uns 80 m d'error)"
        ),
    )
    open_now: bool | None = Field(
        ..., description="Si és obert ara; null si no se'n sap l'horari"
    )

    @classmethod
    def of(cls, space: Space) -> Self:
        # ``recommend`` drops the spaces without a distance.
        if space.distance_m is None:
            raise ValueError(f"Space {space.id} has no distance")
        return cls(
            id=space.id,
            name=space.name,
            type=space.type,
            address=space.address,
            location=EventLocation.model_validate(space.location.model_dump()),
            wifi=space.wifi,
            silence_level=space.silence,
            plugs=space.plugs,
            group_friendly=space.group_friendly,
            distance_m=space.distance_m,
            open_now=space.open_now,
        )
