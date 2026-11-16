import uuid

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.domain.achievements.models import Achievement, AchievementKind
from app.domain.achievements.rules import progress, unlockable

STREAK = AchievementKind.STREAK_DAYS
QUIZ = AchievementKind.QUIZ_COMPLETED
SUBSCRIPTION = AchievementKind.EVENT_SUBSCRIPTION


def _a(code: str, kind: AchievementKind, threshold: int) -> Achievement:
    return Achievement(
        id=uuid.uuid4(),
        code=code,
        name=code,
        description=f"Fita {code}",
        kind=kind,
        threshold=threshold,
    )


STREAK_3 = _a("streak_3", STREAK, 3)
STREAK_7 = _a("streak_7", STREAK, 7)
STREAK_30 = _a("streak_30", STREAK, 30)
QUIZ_1 = _a("quiz_1", QUIZ, 1)
QUIZ_10 = _a("quiz_10", QUIZ, 10)
SUB_1 = _a("sub_1", SUBSCRIPTION, 1)
SUB_10 = _a("sub_10", SUBSCRIPTION, 10)
CATALOG = [STREAK_3, STREAK_7, STREAK_30, QUIZ_1, QUIZ_10, SUB_1, SUB_10]


def _codes(achievements: list[Achievement]) -> set[str]:
    return {a.code for a in achievements}


# TG-58 criteri 4: valor >= llindar desbloqueja (ratxa)
@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, set()),
        (2, set()),
        (3, {"streak_3"}),
        (6, {"streak_3"}),
        (7, {"streak_3", "streak_7"}),
        (30, {"streak_3", "streak_7", "streak_30"}),
        (100, {"streak_3", "streak_7", "streak_30"}),
    ],
)
def test_streak_unlocks_every_threshold_reached(value: int, expected: set[str]) -> None:
    assert _codes(unlockable(CATALOG, STREAK, value, set())) == expected


# TG-58 criteris 2 i 6: la mateixa regla per a quiz i subscripcions (la «primera
# vegada» és un llindar 1)
@pytest.mark.parametrize(
    ("kind", "value", "expected"),
    [
        (QUIZ, 0, set()),
        (QUIZ, 1, {"quiz_1"}),
        (QUIZ, 9, {"quiz_1"}),
        (QUIZ, 10, {"quiz_1", "quiz_10"}),
        (SUBSCRIPTION, 0, set()),
        (SUBSCRIPTION, 1, {"sub_1"}),
        (SUBSCRIPTION, 10, {"sub_1", "sub_10"}),
    ],
)
def test_counter_kinds_unlock_with_the_same_rule(
    kind: AchievementKind, value: int, expected: set[str]
) -> None:
    assert _codes(unlockable(CATALOG, kind, value, set())) == expected


# TG-58 criteri 2: un kind diferent no desbloqueja res
def test_activity_of_other_kind_unlocks_nothing() -> None:
    assert unlockable([STREAK_3, QUIZ_1], SUBSCRIPTION, 99, set()) == []
    assert unlockable([STREAK_3], QUIZ, 99, set()) == []


def test_empty_catalog_unlocks_nothing() -> None:
    assert unlockable([], STREAK, 10, set()) == []


# TG-58 criteri 3: no es tornen a desbloquejar
def test_already_unlocked_achievements_are_not_returned_again() -> None:
    result = unlockable(CATALOG, STREAK, 7, {STREAK_3.id})

    assert _codes(result) == {"streak_7"}


def test_everything_already_unlocked_returns_nothing() -> None:
    assert unlockable(CATALOG, STREAK, 30, {a.id for a in CATALOG}) == []


def test_unlock_ids_of_other_achievements_are_ignored() -> None:
    result = unlockable(CATALOG, QUIZ, 1, {uuid.uuid4()})

    assert _codes(result) == {"quiz_1"}


# TG-58 criteri 7: progrés (progress, goal), igual per a tots els tipus
def test_progress_is_current_value_over_threshold() -> None:
    assert progress(STREAK_7, 3, unlocked=False) == (3, 7)


@pytest.mark.parametrize("achievement", [STREAK_7, QUIZ_10, SUB_10])
def test_progress_is_the_same_for_every_kind(achievement: Achievement) -> None:
    assert progress(achievement, 4, unlocked=False) == (4, achievement.threshold)


def test_progress_never_exceeds_the_goal() -> None:
    assert progress(STREAK_7, 50, unlocked=False) == (7, 7)


def test_progress_with_zero_value_is_zero() -> None:
    assert progress(STREAK_7, 0, unlocked=False) == (0, 7)


def test_progress_with_negative_value_is_zero() -> None:
    assert progress(STREAK_7, -5, unlocked=False) == (0, 7)


def test_progress_of_threshold_one_is_zero_or_complete() -> None:
    assert progress(QUIZ_1, 0, unlocked=False) == (0, 1)
    assert progress(QUIZ_1, 1, unlocked=False) == (1, 1)


# TG-58 criteri 7: desbloquejada = completa
def test_unlocked_achievement_is_complete_even_with_low_value() -> None:
    assert progress(STREAK_7, 2, unlocked=True) == (7, 7)


@given(
    threshold=st.integers(min_value=1, max_value=1000),
    value=st.integers(min_value=-100, max_value=10_000),
    unlocked=st.booleans(),
    kind=st.sampled_from(list(AchievementKind)),
)
def test_progress_is_within_zero_and_goal_property(
    threshold: int, value: int, unlocked: bool, kind: AchievementKind
) -> None:
    done, goal = progress(_a("p", kind, threshold), value, unlocked=unlocked)

    assert goal == threshold
    assert 0 <= done <= goal
    assert done == (goal if unlocked else min(max(value, 0), threshold))


@given(
    kind=st.sampled_from(list(AchievementKind)),
    value=st.integers(min_value=0, max_value=200),
    unlocked_mask=st.lists(st.booleans(), min_size=len(CATALOG), max_size=len(CATALOG)),
)
def test_unlockable_is_exactly_the_reached_and_locked_of_that_kind_property(
    kind: AchievementKind, value: int, unlocked_mask: list[bool]
) -> None:
    unlocked = {a.id for a, flag in zip(CATALOG, unlocked_mask, strict=True) if flag}
    expected = {
        a.id
        for a in CATALOG
        if a.kind is kind and value >= a.threshold and a.id not in unlocked
    }

    assert {a.id for a in unlockable(CATALOG, kind, value, unlocked)} == expected
