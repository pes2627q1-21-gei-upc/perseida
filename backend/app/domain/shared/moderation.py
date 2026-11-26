from pydantic import BaseModel, ConfigDict

# Code of the error raised when the moderator refuses a text; shared by the chat of
# the events and the direct chat.
CHAT_MESSAGE_REJECTED = "CHAT_MESSAGE_REJECTED"


class ModerationResult(BaseModel):
    """What a moderator decided about a text."""

    model_config = ConfigDict(frozen=True)

    approved: bool
    reason: str | None = None
