from typing import Protocol

from app.domain.users.models import User


class UserRepository(Protocol):
    async def get_by_google_sub(self, google_sub: str) -> User | None:
        """Return the account linked to a Google ``sub``, deleted ones included."""
        ...

    async def add(self, user: User) -> User:
        """Persist a new account with its Google identity, safe against races.

        If another request registered the same ``google_sub`` first, return that
        account instead of creating a second one.

        Raises:
            ConflictError: code EMAIL_ALREADY_REGISTERED if the email belongs to an
                account linked to a different ``google_sub``.
        """
        ...

    async def save_last_login(self, user: User) -> None:
        """Persist ``user.last_login_at``."""
        ...
