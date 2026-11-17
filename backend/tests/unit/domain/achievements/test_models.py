import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.achievements.models import (
    Achievement,
    AchievementCategory,
    AchievementKind,
    UserAchievement,
)
from app.domain.shared.errors import ValidationError

NOW = datetime(2026, 11, 16, 10, 0, tzinfo=UTC)


def _achievement(**overrides: object) -> Achievement:
    data: dict[str, object] = {
        "id": uuid.uuid4(),
        "code": "streak_7",
        "name": "Una setmana seguida",
        "description": "Mantén una ratxa de 7 dies.",
        "kind": AchievementKind.STREAK_DAYS,
        "threshold": 7,
        "category": AchievementCategory.STREAKS,
        "position": 1,
    }
    data.update(overrides)
    return Achievement(**data)  # type: ignore[arg-type]


ALL_KINDS = {
    "STREAK_DAYS": "streak_days",
    "QUIZ_COMPLETED": "quiz_completed",
    "QUIZ_PERFECT": "quiz_perfect",
    "EVENT_SUBSCRIPTION": "event_subscription",
    "EVENT_EXPORTED": "event_exported",
    "FOLLOWERS": "followers",
    "FOLLOWING": "following",
    "MESSAGE_SENT": "message_sent",
    "ACHIEVEMENT_SHARED": "achievement_shared",
    "MINIGAME_PLAYED": "minigame_played",
    "MINIGAME_WON": "minigame_won",
    "MINIGAME_RECORD_BEATEN": "minigame_record_beaten",
    "MINIGAME_CHALLENGE_SENT": "minigame_challenge_sent",
}


# TG-58: els 13 tipus del catàleg (noms de membre i valors estables)
def test_achievement_kind_values_are_stable() -> None:
    assert {k.name: k.value for k in AchievementKind} == ALL_KINDS
    assert {k.value for k in AchievementKind} == set(ALL_KINDS.values())
    assert len(AchievementKind) == 13


# TG-58: Achievement accepta cadascun dels 13 tipus
@pytest.mark.parametrize("kind", sorted(ALL_KINDS.values()))
def test_achievement_accepts_every_catalog_kind(kind: str) -> None:
    achievement = _achievement(kind=kind)

    assert achievement.kind is AchievementKind(kind)
    assert achievement.kind.value == kind


# TG-58: categories del catàleg
def test_achievement_category_values_are_stable() -> None:
    assert {c.value for c in AchievementCategory} == {
        "streaks",
        "quiz",
        "events",
        "social",
        "minigame",
    }


# TG-58: categoria i ordre dins la categoria
def test_achievement_keeps_category_and_position() -> None:
    achievement = _achievement(category=AchievementCategory.QUIZ, position=3)

    assert achievement.category is AchievementCategory.QUIZ
    assert achievement.position == 3


def test_achievement_category_may_differ_from_kind_family() -> None:
    achievement = _achievement(
        kind=AchievementKind.QUIZ_COMPLETED, category=AchievementCategory.SOCIAL
    )

    assert achievement.category is AchievementCategory.SOCIAL


@pytest.mark.parametrize("position", [0, -1, -10])
def test_achievement_with_position_below_one_is_rejected(position: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        _achievement(position=position)

    assert exc_info.value.code == "ACHIEVEMENT_POSITION_INVALID"


def test_achievement_with_position_one_is_valid() -> None:
    assert _achievement(position=1).position == 1


def test_achievement_with_unknown_category_is_rejected() -> None:
    with pytest.raises(PydanticValidationError):
        _achievement(category="astronomy")


# TG-58 criteri 1: fita amb codi estable i llindar
def test_achievement_keeps_its_fields() -> None:
    achievement = _achievement()

    assert achievement.code == "streak_7"
    assert achievement.kind is AchievementKind.STREAK_DAYS
    assert achievement.threshold == 7


def test_achievement_is_frozen() -> None:
    achievement = _achievement()

    with pytest.raises(PydanticValidationError):
        achievement.threshold = 3  # type: ignore[misc]


@pytest.mark.parametrize("threshold", [0, -1, -10])
def test_achievement_with_threshold_below_one_is_rejected(threshold: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        _achievement(threshold=threshold)

    assert exc_info.value.code == "ACHIEVEMENT_THRESHOLD_INVALID"


def test_achievement_with_threshold_one_is_valid() -> None:
    assert _achievement(threshold=1).threshold == 1


@pytest.mark.parametrize("code", ["", "   "])
def test_achievement_with_blank_code_is_rejected(code: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        _achievement(code=code)

    assert exc_info.value.code == "ACHIEVEMENT_CODE_INVALID"


@pytest.mark.parametrize("kind", ["first_quiz", "first_subscription", "first_photo"])
def test_achievement_with_unknown_kind_is_rejected(kind: str) -> None:
    with pytest.raises(PydanticValidationError):
        _achievement(kind=kind)


# TG-58 criteri 2: desbloqueig registrat en UTC
def test_user_achievement_keeps_its_fields() -> None:
    user_id, achievement_id = uuid.uuid4(), uuid.uuid4()

    unlocked = UserAchievement(
        id=uuid.uuid4(),
        user_id=user_id,
        achievement_id=achievement_id,
        unlocked_at=NOW,
    )

    assert (unlocked.user_id, unlocked.achievement_id) == (user_id, achievement_id)
    assert unlocked.unlocked_at == NOW


def test_user_achievement_is_frozen() -> None:
    unlocked = UserAchievement(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        achievement_id=uuid.uuid4(),
        unlocked_at=NOW,
    )

    with pytest.raises(PydanticValidationError):
        unlocked.unlocked_at = NOW + timedelta(days=1)  # type: ignore[misc]


@pytest.mark.parametrize(
    "moment",
    [
        datetime(2026, 11, 16, 10, 0),  # naive
        datetime(2026, 11, 16, 10, 0, tzinfo=timezone(timedelta(hours=1))),
    ],
    ids=["naive", "non-utc"],
)
def test_user_achievement_rejects_naive_or_non_utc_datetime(
    moment: datetime,
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        UserAchievement(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            achievement_id=uuid.uuid4(),
            unlocked_at=moment,
        )

    assert exc_info.value.code == "ACHIEVEMENT_UNLOCKED_AT_INVALID"
