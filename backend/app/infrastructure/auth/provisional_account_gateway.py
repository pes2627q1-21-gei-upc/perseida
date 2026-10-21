from app.domain.auth.models import AccountStatus, GoogleIdentity


class ProvisionalAccountGateway:
    """``AccountGateway`` that accepts every account.

    Provisional: US #45 (user model and sign-up on first access) replaces it with
    the real lookup and returns the stored status; nothing else has to change.
    """

    async def get_status(self, identity: GoogleIdentity) -> AccountStatus:
        return AccountStatus.ACTIVE
