from app.application.streaks.streak_service import StreakService
from app.application.users.user_service import UserService


class UserStreakActivityRegistrar:
    """Connects the APOD with the streak of the user (the port is in ``apod``)."""

    def __init__(self, users: UserService, streaks: StreakService) -> None:
        self._users = users
        self._streaks = streaks

    async def register(self, subject: str) -> None:
        user = await self._users.get_profile(subject)
        await self._streaks.register_activity(user.id)
