import uuid
from datetime import timedelta

from app.application.achievements.achievement_service import AchievementService
from app.domain.achievements.models import (
    Achievement,
    AchievementCategory,
    AchievementKind,
)
from tests.fakes.achievements import FakeAchievementRepository

USER_ID = uuid.uuid4()
OTHER_USER_ID = uuid.uuid4()


def _achievement(
    kind: AchievementKind, threshold: int, position: int = 1
) -> Achievement:
    return Achievement(
        id=uuid.uuid4(),
        code=f"{kind.value}_{threshold}",
        name=f"{kind.value} {threshold}",
        description="d",
        kind=kind,
        threshold=threshold,
        category=AchievementCategory.STREAKS,
        position=position,
    )


STREAK_3 = _achievement(AchievementKind.STREAK_DAYS, 3, 1)
STREAK_7 = _achievement(AchievementKind.STREAK_DAYS, 7, 2)
QUIZ_10 = _achievement(AchievementKind.QUIZ_COMPLETED, 10, 1)


class _Streak:
    """Stand-in for ``StreakService.get_current_streak``."""

    def __init__(self, days: int = 0) -> None:
        self.days = days
        self.calls: list[uuid.UUID] = []

    async def __call__(self, user_id: uuid.UUID) -> int:
        self.calls.append(user_id)
        return self.days


def _service(
    repo: FakeAchievementRepository, streak: _Streak | None = None
) -> AchievementService:
    return AchievementService(repo, streak or _Streak())


# TG-58 criteri 2 i 4
async def test_reaching_the_threshold_unlocks_the_achievement() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)

    unlocked = await _service(repo).record_activity(USER_ID, "streak_days", 3)

    assert [item.achievement_id for item in unlocked] == [STREAK_3.id]
    assert await repo.list_unlocked_ids(USER_ID) == {STREAK_3.id}


# TG-58 criteri 4
async def test_a_value_that_reaches_several_thresholds_unlocks_them_all() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)

    unlocked = await _service(repo).record_activity(USER_ID, "streak_days", 7)

    assert {item.achievement_id for item in unlocked} == {STREAK_3.id, STREAK_7.id}


async def test_a_value_below_every_threshold_unlocks_nothing() -> None:
    repo = FakeAchievementRepository(STREAK_3)

    unlocked = await _service(repo).record_activity(USER_ID, "streak_days", 2)

    assert unlocked == []
    assert repo.unlock_calls == []


# TG-58 criteri 3
async def test_an_already_unlocked_achievement_is_not_unlocked_again() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)
    service = _service(repo)
    await service.record_activity(USER_ID, "streak_days", 3)

    again = await service.record_activity(USER_ID, "streak_days", 3)

    assert again == []
    assert len(repo.unlocked[USER_ID]) == 1


async def test_only_the_achievements_still_locked_are_requested_to_unlock() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)
    service = _service(repo)
    await service.record_activity(USER_ID, "streak_days", 3)

    await service.record_activity(USER_ID, "streak_days", 7)

    assert repo.unlock_calls[-1] == (USER_ID, {STREAK_7.id})


async def test_unlocks_are_per_user() -> None:
    repo = FakeAchievementRepository(STREAK_3)
    service = _service(repo)
    await service.record_activity(USER_ID, "streak_days", 3)

    unlocked = await service.record_activity(OTHER_USER_ID, "streak_days", 3)

    assert [item.achievement_id for item in unlocked] == [STREAK_3.id]


async def test_only_achievements_of_the_same_kind_are_unlocked() -> None:
    repo = FakeAchievementRepository(STREAK_3, QUIZ_10)

    unlocked = await _service(repo).record_activity(USER_ID, "quiz_completed", 10)

    assert [item.achievement_id for item in unlocked] == [QUIZ_10.id]


# TG-58 criteri 6 i tasca TG-573: activitat desconeguda
async def test_an_unknown_activity_does_not_fail_nor_unlock_anything() -> None:
    repo = FakeAchievementRepository(STREAK_3)

    unlocked = await _service(repo).record_activity(USER_ID, "teleport", 99)

    assert unlocked == []
    assert repo.unlock_calls == []


# TG-58 criteri 7: progrés
async def test_progress_of_a_streak_achievement_uses_the_current_streak() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)
    streak = _Streak(days=5)

    items = await _service(repo, streak).list_progress(USER_ID)

    by_id = {item.achievement.id: item for item in items}
    assert (by_id[STREAK_3.id].current, by_id[STREAK_3.id].goal) == (3, 3)
    assert (by_id[STREAK_7.id].current, by_id[STREAK_7.id].goal) == (5, 7)
    assert streak.calls == [USER_ID]


async def test_progress_is_zero_for_a_lapsed_streak() -> None:
    repo = FakeAchievementRepository(STREAK_7)

    items = await _service(repo, _Streak(days=0)).list_progress(USER_ID)

    assert items[0].current == 0
    assert items[0].unlocked is False


async def test_an_unlocked_achievement_keeps_a_full_bar_after_the_streak_lapses() -> (
    None
):
    repo = FakeAchievementRepository(STREAK_7)
    service = _service(repo, _Streak(days=0))
    await service.record_activity(USER_ID, "streak_days", 7)

    items = await service.list_progress(USER_ID)

    assert (items[0].current, items[0].goal) == (7, 7)
    assert items[0].unlocked is True


async def test_progress_of_unconnected_kinds_is_zero_until_unlocked() -> None:
    repo = FakeAchievementRepository(QUIZ_10)

    items = await _service(repo).list_progress(USER_ID)

    assert (items[0].current, items[0].goal) == (0, 10)


async def test_progress_only_shows_the_unlocks_of_the_user() -> None:
    repo = FakeAchievementRepository(STREAK_3)
    service = _service(repo)
    await service.record_activity(OTHER_USER_ID, "streak_days", 3)

    items = await service.list_progress(USER_ID)

    assert items[0].unlocked is False


# TG-58 criteri 4 i 6: AchievementService és l'ActivityLog que la ratxa avisa
async def test_record_unlocks_like_record_activity() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)

    await _service(repo).record(USER_ID, "streak_days", 3)

    assert await repo.list_unlocked_ids(USER_ID) == {STREAK_3.id}


# TG-58 criteri 7: la ratxa només compta per a les fites de ratxa
async def test_a_live_streak_does_not_count_for_other_kinds() -> None:
    repo = FakeAchievementRepository(STREAK_7, QUIZ_10)

    items = await _service(repo, _Streak(days=5)).list_progress(USER_ID)

    by_id = {item.achievement.id: item for item in items}
    assert by_id[STREAK_7.id].current == 5
    assert by_id[QUIZ_10.id].current == 0


# TG-574 (US TG-58 criteri 7): la data de desbloqueig viatja amb el progrés
async def test_a_locked_achievement_has_no_unlock_moment() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)

    items = await _service(repo, _Streak(days=2)).list_progress(USER_ID)

    assert [item.unlocked_at for item in items] == [None, None]


async def test_an_unlocked_achievement_carries_its_utc_unlock_moment() -> None:
    repo = FakeAchievementRepository(STREAK_3, STREAK_7)
    service = _service(repo, _Streak(days=5))
    await service.record_activity(USER_ID, "streak_days", 3)
    moment = repo.unlocked[USER_ID][STREAK_3.id].unlocked_at

    items = await service.list_progress(USER_ID)

    by_id = {item.achievement.id: item for item in items}
    assert by_id[STREAK_3.id].unlocked_at == moment
    assert by_id[STREAK_3.id].unlocked_at.utcoffset() == timedelta(0)
    assert by_id[STREAK_7.id].unlocked_at is None


async def test_the_unlock_moment_survives_a_lapsed_streak() -> None:
    repo = FakeAchievementRepository(STREAK_7)
    await _service(repo).record_activity(USER_ID, "streak_days", 7)
    moment = repo.unlocked[USER_ID][STREAK_7.id].unlocked_at

    items = await _service(repo, _Streak(days=0)).list_progress(USER_ID)

    assert (items[0].current, items[0].goal) == (7, 7)
    assert items[0].unlocked_at == moment


async def test_the_unlock_moment_is_never_taken_from_another_user() -> None:
    repo = FakeAchievementRepository(STREAK_3)
    await _service(repo).record_activity(OTHER_USER_ID, "streak_days", 3)

    items = await _service(repo).list_progress(USER_ID)

    assert items[0].unlocked_at is None
