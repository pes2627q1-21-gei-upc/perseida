from app.application.streaks.streak_service import STREAK_DAYS
from app.domain.achievements.models import AchievementKind


# TG-58 criteri 4: la ratxa i el motor no s'importen entre ells, així que el nom
# de l'activitat hi és escrit dues vegades; si divergeixen, el motor l'ignoraria.
def test_the_streak_activity_name_is_the_achievement_kind_value() -> None:
    assert AchievementKind.STREAK_DAYS.value == STREAK_DAYS
