from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BANNED = "banned"
    DELETED = "deleted"


class GoogleIdentity(BaseModel):
    """Identity of a user as asserted by a verified Google ID token."""

    model_config = ConfigDict(frozen=True)

    google_sub: str
    email: str
    name: str | None = None
    picture: str | None = None


class SessionClaims(BaseModel):
    """Content of one of our own session tokens (``exp`` is a UTC datetime)."""

    model_config = ConfigDict(frozen=True)

    sub: str
    jti: str
    type: TokenType
    exp: datetime


class SessionTokens(BaseModel):
    """The pair of tokens returned to the app; ``expires_in`` is in seconds."""

    model_config = ConfigDict(frozen=True)

    access_token: str
    refresh_token: str
    expires_in: int
