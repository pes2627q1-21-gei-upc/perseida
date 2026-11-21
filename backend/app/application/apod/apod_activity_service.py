import logging

from app.domain.apod.ports import DailyActivityRegistrar

logger = logging.getLogger(__name__)


class ApodActivityService:
    def __init__(self, registrar: DailyActivityRegistrar) -> None:
        self._registrar = registrar

    async def register_visit(self, subject: str) -> None:
        """Register the day activity of a signed-in user, best effort.

        A failure is only logged: it must never break the public APOD response.
        """
        try:
            await self._registrar.register(subject)
        except Exception:
            logger.warning("Could not register the daily activity", exc_info=True)
