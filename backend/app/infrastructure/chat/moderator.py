from app.domain.chat.models import ModerationResult


class ApproveAllModerator:
    """Temporary moderator; TG-81 replaces it with Kev-4B."""

    async def moderate(self, text: str) -> ModerationResult:
        return ModerationResult(approved=True)
