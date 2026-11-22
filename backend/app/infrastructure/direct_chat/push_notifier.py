import uuid

from app.domain.direct_chat.models import DirectMessage


class NoopPushNotifier:
    """PushNotifier that sends nothing, until there is a push provider."""

    async def notify(self, recipient_id: uuid.UUID, message: DirectMessage) -> None:
        # TODO(TG-73): enviar push FCM quan el destinatari no tingui WS obert
        return None
