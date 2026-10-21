from app.application.users.errors import EMAIL_ALREADY_REGISTERED
from app.domain.shared.errors import ConflictError
from app.domain.users.models import User


class InMemoryUserRepository:
    """Accounts by ``google_sub``. Records the logins it was asked to save."""

    def __init__(self, *users: User) -> None:
        self.users: dict[str, User] = {user.google_sub: user for user in users}
        self.saved_logins: list[User] = []

    async def get_by_google_sub(self, google_sub: str) -> User | None:
        return self.users.get(google_sub)

    async def add(self, user: User) -> User:
        if user.google_sub in self.users:
            return self.users[user.google_sub]
        if any(other.email == user.email for other in self.users.values()):
            raise ConflictError(EMAIL_ALREADY_REGISTERED)
        self.users[user.google_sub] = user
        return user

    async def save_last_login(self, user: User) -> None:
        self.users[user.google_sub] = user
        self.saved_logins.append(user)
