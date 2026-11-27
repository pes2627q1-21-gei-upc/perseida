import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Double,
    ForeignKey,
    Index,
    String,
    Uuid,
    text,
)
from sqlmodel import Field, SQLModel

from app.domain.outings.models import (
    DESCRIPTION_MAX_LENGTH,
    PLACE_ADDRESS_MAX_LENGTH,
    PLACE_NAME_MAX_LENGTH,
    TITLE_MAX_LENGTH,
)


class OutingRow(SQLModel, table=True):
    """Table ``outings`` (TG-629). The domain entity is ``Outing``.

    A table of its own: outings never mix with ``astronomical_events``.
    """

    __tablename__ = "outings"
    __table_args__ = (
        CheckConstraint("ends_at >= starts_at", name="ends_not_before_starts"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        CheckConstraint("char_length(title) >= 1", name="title_not_empty"),
        # The place is all or nothing: a name always comes with its address (maybe "").
        CheckConstraint(
            "(place_name IS NULL) = (place_address IS NULL)", name="place_all_or_none"
        ),
        CheckConstraint(
            "place_name IS NULL OR char_length(place_name) >= 1",
            name="place_name_not_empty",
        ),
        # The upcoming list filters by start, optionally by event or author.
        Index("ix_outings_event_id_starts_at", "event_id", "starts_at"),
        Index("ix_outings_author_id_starts_at", "author_id", "starts_at"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    # RESTRICT like the other tables of a user: accounts are deleted softly.
    author_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        )
    )
    # If an event ever goes away, the outing stays, unlinked.
    event_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            Uuid(),
            ForeignKey("astronomical_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    title: str = Field(sa_column=Column(String(TITLE_MAX_LENGTH), nullable=False))
    description: str = Field(
        sa_column=Column(String(DESCRIPTION_MAX_LENGTH), nullable=False)
    )
    starts_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True)
    )
    ends_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    latitude: float = Field(sa_column=Column(Double(), nullable=False))
    longitude: float = Field(sa_column=Column(Double(), nullable=False))
    # The recommended local chosen as the place (TG-661); both null for any other place.
    place_name: str | None = Field(
        default=None, sa_column=Column(String(PLACE_NAME_MAX_LENGTH), nullable=True)
    )
    place_address: str | None = Field(
        default=None,
        sa_column=Column(String(PLACE_ADDRESS_MAX_LENGTH), nullable=True),
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=text("now()")
        )
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=text("now()")
        )
    )
