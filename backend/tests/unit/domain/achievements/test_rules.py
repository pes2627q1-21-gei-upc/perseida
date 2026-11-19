import uuid

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.domain.achievements.models import (
    Achievement,
    AchievementCategory,
    AchievementKind,
)
from app.domain.achievements.rules import next_achievement, progress, unlockable

STREAK = AchievementKind.STREAK_DAYS
QUIZ = AchievementKind.QUIZ_COMPLETED
SUBSCRIPTION = AchievementKind.EVENT_SUBSCRIPTION


ALL_KIND_VALUES = {
    "streak_days",
    "quiz_completed",
    "quiz_perfect",
    "event_subscription",
    "event_exported",
    "followers",
    "following",
    "message_sent",
    "achievement_shared",
    "minigame_played",
    "minigame_won",
    "minigame_record_beaten",
    "minigame_challenge_sent",
}

CAT = AchievementCategory
_DEFAULT_CATEGORY = {
    AchievementKind.STREAK_DAYS: CAT.STREAKS,
    AchievementKind.QUIZ_COMPLETED: CAT.QUIZ,
    AchievementKind.EVENT_SUBSCRIPTION: CAT.EVENTS,
}


def _a(
    code: str,
    kind: AchievementKind,
    threshold: int,
    category: AchievementCategory | None = None,
    position: int = 1,
) -> Achievement:
    return Achievement(
        id=uuid.uuid4(),
        code=code,
        name=code,
        description=f"Fita {code}",
        kind=kind,
        threshold=threshold,
        category=category or _DEFAULT_CATEGORY.get(kind, CAT.SOCIAL),
        position=position,
    )


STREAK_3 = _a("streak_3", STREAK, 3, position=1)
STREAK_7 = _a("streak_7", STREAK, 7, position=2)
STREAK_30 = _a("streak_30", STREAK, 30, position=3)
QUIZ_1 = _a("quiz_1", QUIZ, 1, position=1)
QUIZ_10 = _a("quiz_10", QUIZ, 10, position=2)
SUB_1 = _a("sub_1", SUBSCRIPTION, 1, position=1)
SUB_10 = _a("sub_10", SUBSCRIPTION, 10, position=2)
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


# TG-58: la regla única serveix per als 13 tipus del catàleg, només del mateix kind
@pytest.mark.parametrize("kind_value", sorted(ALL_KIND_VALUES))
def test_unlockable_works_for_every_catalog_kind(kind_value: str) -> None:
    kind = AchievementKind(kind_value)
    catalog = [
        _a(f"{other}_5", AchievementKind(other), 5) for other in sorted(ALL_KIND_VALUES)
    ]
    own = next(a for a in catalog if a.kind is kind)

    assert unlockable(catalog, kind, 4, set()) == []
    assert unlockable(catalog, kind, 5, set()) == [own]
    assert unlockable(catalog, kind, 50, set()) == [own]
    assert unlockable(catalog, kind, 5, {own.id}) == []


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


# TG-58: «fita següent» d'una categoria
def test_next_achievement_is_the_lowest_position_of_the_category() -> None:
    assert next_achievement(CATALOG, CAT.STREAKS, set()) == STREAK_3


def test_next_achievement_orders_by_position_even_if_catalog_is_unordered() -> None:
    shuffled = [STREAK_30, SUB_1, STREAK_3, QUIZ_1, STREAK_7]

    assert next_achievement(shuffled, CAT.STREAKS, set()) == STREAK_3


def test_next_achievement_ignores_other_categories() -> None:
    assert next_achievement(CATALOG, CAT.QUIZ, set()) == QUIZ_1
    assert next_achievement(CATALOG, CAT.EVENTS, set()) == SUB_1


def test_next_achievement_skips_unlocked_ones() -> None:
    assert next_achievement(CATALOG, CAT.STREAKS, {STREAK_3.id}) == STREAK_7
    assert (
        next_achievement(CATALOG, CAT.STREAKS, {STREAK_3.id, STREAK_7.id}) == STREAK_30
    )


def test_next_achievement_skips_unlocked_even_if_a_later_one_is_locked() -> None:
    # Desbloquejar la 3a no fa que la 1a deixi de ser la següent.
    assert next_achievement(CATALOG, CAT.STREAKS, {STREAK_30.id}) == STREAK_3


def test_next_achievement_is_none_when_all_of_the_category_are_unlocked() -> None:
    unlocked = {STREAK_3.id, STREAK_7.id, STREAK_30.id}

    assert next_achievement(CATALOG, CAT.STREAKS, unlocked) is None


def test_next_achievement_is_none_when_category_has_no_achievements() -> None:
    assert next_achievement(CATALOG, CAT.MINIGAME, set()) is None
    assert next_achievement([], CAT.STREAKS, set()) is None


def test_next_achievement_follows_category_not_kind() -> None:
    quiz_perfect_like = _a("clear_sky", QUIZ, 1, category=CAT.QUIZ, position=2)
    social_by_quiz_kind = _a("odd", QUIZ, 1, category=CAT.SOCIAL, position=1)
    catalog = [quiz_perfect_like, social_by_quiz_kind, QUIZ_1]

    assert next_achievement(catalog, CAT.SOCIAL, set()) == social_by_quiz_kind
    assert next_achievement(catalog, CAT.QUIZ, {QUIZ_1.id}) == quiz_perfect_like


@st.composite
def _catalogs(draw: st.DrawFn) -> list[Achievement]:
    entries = draw(
        st.lists(
            st.tuples(st.sampled_from(list(CAT)), st.integers(1, 20)),
            max_size=15,
        )
    )
    return [
        _a(f"c{i}", STREAK, 1, category=category, position=position)
        for i, (category, position) in enumerate(entries)
    ]


@given(
    catalog=_catalogs(),
    category=st.sampled_from(list(CAT)),
    data=st.data(),
)
def test_next_achievement_is_of_category_locked_and_minimal_position_property(
    catalog: list[Achievement], category: AchievementCategory, data: st.DataObject
) -> None:
    unlocked = {
        a.id for a in catalog if data.draw(st.booleans(), label=f"unlocked {a.code}")
    }
    candidates = [a for a in catalog if a.category is category and a.id not in unlocked]

    result = next_achievement(catalog, category, unlocked)

    if not candidates:
        assert result is None
    else:
        assert result is not None
        assert result.category is category
        assert result.id not in unlocked
        assert result.position == min(a.position for a in candidates)
