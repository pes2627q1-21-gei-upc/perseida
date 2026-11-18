import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlmodel import Field, SQLModel


class AchievementRow(SQLModel, table=True):
    """Table ``achievements``: the catalog. Persistence model of ``Achievement``."""

    __tablename__ = "achievements"
    __table_args__ = (
        CheckConstraint("threshold >= 1", name="threshold_positive"),
        CheckConstraint("position >= 1", name="position_positive"),
        UniqueConstraint("category", "position"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    code: str = Field(sa_column=Column(String(), nullable=False, unique=True))
    name: str = Field(sa_column=Column(String(), nullable=False))
    description: str = Field(sa_column=Column(Text(), nullable=False))
    kind: str = Field(sa_column=Column(String(), nullable=False))
    threshold: int = Field(sa_column=Column(Integer(), nullable=False))
    category: str = Field(sa_column=Column(String(), nullable=False))
    position: int = Field(sa_column=Column(Integer(), nullable=False))


class UserAchievementRow(SQLModel, table=True):
    """Table ``user_achievements``: one row per achievement a user has unlocked."""

    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        )
    )
    achievement_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("achievements.id", ondelete="RESTRICT"), nullable=False
        )
    )
    unlocked_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=text("now()")
        )
    )
