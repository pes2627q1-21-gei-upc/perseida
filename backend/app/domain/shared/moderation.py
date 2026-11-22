from pydantic import BaseModel, ConfigDict


class ModerationResult(BaseModel):
    """What a moderator decided about a text."""

    model_config = ConfigDict(frozen=True)

    approved: bool
    reason: str | None = None
