from datetime import date

from sqlmodel import Field, SQLModel

from app.infrastructure.persistence import models  # noqa: F401  (naming convention)


class ApodTable(SQLModel, table=True):
    """Stored APODs. The domain entity is ``app.domain.apod.models.Apod``."""

    __tablename__ = "apod"

    id: int | None = Field(default=None, primary_key=True)
    # One APOD per date: the unique constraint is uq_apod_apod_date.
    apod_date: date = Field(unique=True)
    title: str
    explanation: str
    media_type: str
    media_url: str
    copyright: str | None = None
