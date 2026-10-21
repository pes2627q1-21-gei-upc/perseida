from collections.abc import Callable
from datetime import UTC, datetime

from app.domain.auth.models import AccountStatus, GoogleIdentity
from app.domain.users.models import Language, User
from app.domain.users.ports import UserRepository


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _parse_language(value: str | None) -> Language:
    try:
        return Language(value or Language.CA)
    except ValueError:
        return Language.CA


class UserService:
    def __init__(
        self,
        users: UserRepository,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._users = users
        self._now = now

    async def sign_in(
        self, identity: GoogleIdentity, language: str | None = None
    ) -> AccountStatus:
        """Register the account on the first access and return its status.

        A returning active account gets its ``last_login_at`` updated; a
        suspended, banned or deleted one is left untouched.

        Raises:
            ConflictError: EMAIL_ALREADY_REGISTERED if the email belongs to an
                account linked to another Google ``sub``.
        """
        user = await self._users.get_by_google_sub(identity.google_sub)
        if user is None:
            created = await self._users.add(
                User.create(
                    google_sub=identity.google_sub,
                    email=identity.email,
                    display_name=identity.name,
                    avatar_url=identity.picture,
                    preferred_language=_parse_language(language),
                )
            )
            return created.account_status
        if user.account_status is AccountStatus.ACTIVE:
            await self._users.save_last_login(user.record_login(self._now()))
        return user.account_status
