from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

ROOM_PATTERN = r"^[a-z0-9_-]+(:[a-z0-9_-]+)*$"
ROOM_MAX_LENGTH = 64
ROOM_CHANNEL_PREFIX = "room:"
REVOCATION_CHANNEL_PREFIX = "session-revoked:"


class FrameType(StrEnum):
    AUTH = "auth"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    MESSAGE = "message"
    ERROR = "error"
    PING = "ping"
    PONG = "pong"


class Frame(BaseModel):
    """Envelope of every WebSocket message, client to server and back (US #63)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    type: FrameType
    room: str | None = Field(
        default=None, pattern=ROOM_PATTERN, max_length=ROOM_MAX_LENGTH
    )
    payload: dict[str, Any] = Field(default_factory=dict)
    id: str | None = None


def room_channel(room: str) -> str:
    """Pub/sub channel of a room; the prefix keeps it apart from internal channels."""
    return f"{ROOM_CHANNEL_PREFIX}{room}"


def revocation_channel(sub: str) -> str:
    """Channel where the session store announces that a user's sessions were revoked."""
    return f"{REVOCATION_CHANNEL_PREFIX}{sub}"
