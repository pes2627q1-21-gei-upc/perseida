import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Column, Date, ForeignKey, Integer, Uuid, text
from sqlmodel import Field, SQLModel


class StreakRow(SQLModel, table=True):
    """Table ``daily_streaks``. Persistence model, separate from ``DailyStreak``."""

    __tablename__ = "daily_streaks"
    __table_args__ = (
        CheckConstraint("current_count >= 1", name="current_count_positive"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    # The unique constraint is the conflict target of the atomic upsert.
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        )
    )
    current_count: int = Field(sa_column=Column(Integer(), nullable=False))
    last_activity_date: date = Field(sa_column=Column(Date(), nullable=False))
