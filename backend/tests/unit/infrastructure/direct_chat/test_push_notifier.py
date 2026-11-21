import uuid

from app.domain.direct_chat.models import DirectMessage
from app.domain.direct_chat.ports import PushNotifier
from app.infrastructure.direct_chat.push_notifier import NoopPushNotifier


async def test_noop_push_notifier_does_nothing_and_does_not_fail() -> None:
    # TG-65 criteri 13: sense proveïdor de push, la notificació és un no-op
    notifier: PushNotifier = NoopPushNotifier()
    message = DirectMessage.create(
        conversation_id=uuid.uuid7(),
        sender_id=uuid.uuid7(),
        text="hola",
        client_message_id=uuid.uuid4(),
    )

    # Completing without raising is the whole contract of the no-op.
    await notifier.notify(uuid.uuid7(), message)
