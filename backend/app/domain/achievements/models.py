import uuid
from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.shared.errors import ValidationError


class AchievementKind(StrEnum):
    """What activity of the user an achievement measures."""

    STREAK_DAYS = "streak_days"
    QUIZ_COMPLETED = "quiz_completed"
    EVENT_SUBSCRIPTION = "event_subscription"


class AchievementCategory(StrEnum):
    """Catalog section an achievement is grouped under (independent of ``kind``)."""

    STREAKS = "streaks"
    QUIZ = "quiz"
    EVENTS = "events"
    SOCIAL = "social"
    MINIGAME = "minigame"


class Achievement(BaseModel):
    """Catalog entry: unlocked when the value of its ``kind`` reaches ``threshold``.

    ``position`` (>= 1) orders the achievements inside their ``category``.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    code: str
    name: str
    description: str
    kind: AchievementKind
    threshold: int
    category: AchievementCategory
    position: int

    @field_validator("code")
    @classmethod
    def _require_code(cls, value: str) -> str:
        if not value.strip():
            raise ValidationError(
                "ACHIEVEMENT_CODE_INVALID", "Achievement code must not be blank"
            )
        return value

    @field_validator("threshold")
    @classmethod
    def _require_positive_threshold(cls, value: int) -> int:
        if value < 1:
            raise ValidationError(
                "ACHIEVEMENT_THRESHOLD_INVALID",
                "Achievement threshold must be at least 1",
            )
        return value

    @field_validator("position")
    @classmethod
    def _require_positive_position(cls, value: int) -> int:
        if value < 1:
            raise ValidationError(
                "ACHIEVEMENT_POSITION_INVALID",
                "Achievement position must be at least 1",
            )
        return value


class UserAchievement(BaseModel):
    """An achievement unlocked by a user, at a UTC moment."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    user_id: uuid.UUID
    achievement_id: uuid.UUID
    unlocked_at: datetime

    @field_validator("unlocked_at")
    @classmethod
    def _require_utc(cls, value: datetime) -> datetime:
        if value.utcoffset() != UTC.utcoffset(None):
            raise ValidationError(
                "ACHIEVEMENT_UNLOCKED_AT_INVALID",
                "Unlock moment must be timezone-aware and in UTC",
            )
        return value
