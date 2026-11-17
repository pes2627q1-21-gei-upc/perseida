from pydantic import BaseModel, ConfigDict, Field


class Location(BaseModel):
    """A point on Earth (WGS 84 degrees). Shared by events and outings (TG-629)."""

    model_config = ConfigDict(frozen=True)

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
