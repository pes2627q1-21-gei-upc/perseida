import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlmodel import Field, SQLModel


def _timestamptz_now() -> Column[datetime]:
    return Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class UserRow(SQLModel, table=True):
    """Table ``users``. Persistence model, separate from the domain ``User``."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint(
            "preferred_language IN ('ca', 'es', 'en')", name="preferred_language"
        ),
        CheckConstraint("role IN ('user', 'moderator', 'admin')", name="role"),
        CheckConstraint("status IN ('active', 'suspended', 'banned')", name="status"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    email: str = Field(sa_column=Column(String(320), nullable=False, unique=True))
    display_name: str | None = Field(
        default=None, sa_column=Column(String(255), nullable=True)
    )
    avatar_url: str | None = Field(
        default=None, sa_column=Column(Text(), nullable=True)
    )
    preferred_language: str = Field(
        default="ca",
        sa_column=Column(String(2), nullable=False, server_default=text("'ca'")),
    )
    role: str = Field(
        default="user",
        sa_column=Column(String(16), nullable=False, server_default=text("'user'")),
    )
    status: str = Field(
        default="active",
        sa_column=Column(String(16), nullable=False, server_default=text("'active'")),
    )
    created_at: datetime = Field(sa_column=_timestamptz_now())
    last_login_at: datetime = Field(sa_column=_timestamptz_now())
    deleted_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class UserIdentityRow(SQLModel, table=True):
    """Table ``user_identities``: external identity (e.g. Google ``sub``)."""

    __tablename__ = "user_identities"
    __table_args__ = (
        CheckConstraint("provider IN ('google')", name="provider"),
        UniqueConstraint("user_id", "provider"),
    )

    provider: str = Field(sa_column=Column(String(16), primary_key=True))
    subject: str = Field(sa_column=Column(String(255), primary_key=True))
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    created_at: datetime = Field(sa_column=_timestamptz_now())
