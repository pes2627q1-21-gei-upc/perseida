import uuid
from datetime import date, timedelta
from typing import Self

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.shared.errors import ValidationError


class DailyStreak(BaseModel):
    """Consecutive-day activity streak of a user. Days are UTC days."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    user_id: uuid.UUID
    current_count: int
    last_activity_date: date

    @field_validator("current_count")
    @classmethod
    def _require_positive_count(cls, value: int) -> int:
        # Same rule as the CHECK of the ``daily_streaks`` table.
        if value < 1:
            raise ValidationError(
                "STREAK_COUNT_INVALID", "Streak count must be at least 1"
            )
        return value

    @classmethod
    def start(cls, user_id: uuid.UUID, today: date) -> Self:
        """Open a streak of one day for the first activity of a user."""
        return cls(
            id=uuid.uuid7(),
            user_id=user_id,
            current_count=1,
            last_activity_date=today,
        )

    def register_activity(self, today: date) -> Self:
        """Return the streak after an activity on ``today``.

        Same day (or a past ``today``): unchanged. Next day: count + 1.
        Any gap: the streak restarts at 1.
        """
        if self.last_activity_date >= today:
            return self
        if self.last_activity_date == today - timedelta(days=1):
            return self.model_copy(
                update={
                    "current_count": self.current_count + 1,
                    "last_activity_date": today,
                }
            )
        return self.model_copy(update={"current_count": 1, "last_activity_date": today})

    def count_on(self, today: date) -> int:
        """Streak length as seen on ``today``: 0 if it is already broken."""
        if self.last_activity_date >= today - timedelta(days=1):
            return self.current_count
        return 0
