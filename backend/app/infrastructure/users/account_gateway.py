from app.application.users.user_service import UserService
from app.domain.auth.models import AccountStatus, GoogleIdentity


class UserAccountGateway:
    """``AccountGateway`` backed by the user accounts: signs up on first access."""

    def __init__(self, users: UserService) -> None:
        self._users = users

    async def get_status(
        self, identity: GoogleIdentity, language: str | None = None
    ) -> AccountStatus:
        return await self._users.sign_in(
            google_sub=identity.google_sub,
            email=identity.email,
            display_name=identity.name,
            avatar_url=identity.picture,
            language=language,
        )
