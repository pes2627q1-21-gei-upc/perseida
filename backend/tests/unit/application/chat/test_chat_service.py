import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.chat.chat_service import ChatService
from app.application.chat.errors import RateLimitedError
from app.application.realtime.errors import RATE_LIMITED
from app.application.shared.errors import ExternalServiceError, ForbiddenError
from app.domain.chat.errors import CHAT_INVALID_CURSOR, CHAT_INVALID_LIMIT
from app.domain.chat.models import ChatAuthor, ChatMessage
from app.domain.shared.errors import (
    BusinessRuleViolation,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from tests.fakes.chat import ChatFakes


@pytest.fixture
def env() -> ChatFakes:
    return ChatFakes()


@pytest.fixture
def service(env: ChatFakes) -> ChatService:
    return ChatService(env, env, env, env, env, env)


async def test_tg439_send_flow_and_cleaned_text(
    service: ChatService, env: ChatFakes
) -> None:
    message = await service.send_message(
        env.user, env.event, " hola ", client_message_id=uuid.uuid4(), author_name=None
    )
    assert message.text == "hola"
    assert env.calls == [
        "event",
        "subscription",
        "room",
        "find",
        "rate",
        "moderate",
        "save",
        "publish",
        "mark",
    ]
    assert env.messages == [message]
    assert env.channels == [f"room:chat:event:{env.event}"]
    envelope = json.loads(env.published[0])
    assert envelope["from"] is None
    assert envelope["frame"]["type"] == "message"
    assert envelope["frame"]["room"] == f"chat:event:{env.event}"
    assert envelope["frame"]["payload"] == message.model_dump(
        mode="json", exclude={"client_message_id"}
    )


async def test_tg439_validation_stops_before_rate(
    service: ChatService, env: ChatFakes
) -> None:
    with pytest.raises(ValidationError):
        await service.send_message(
            env.user, env.event, "  ", client_message_id=uuid.uuid4(), author_name=None
        )
    assert env.calls == ["event", "subscription", "room"]


async def test_tg439_forbidden_prevents_access(
    service: ChatService, env: ChatFakes
) -> None:
    env.subscribed = False
    with pytest.raises(ForbiddenError):
        await service.send_message(
            env.user,
            env.event,
            "hello",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )
    assert env.calls == ["event", "subscription"]
    assert not env.messages and not env.published
    with pytest.raises(ForbiddenError):
        await service.history(env.user, env.event)


@pytest.mark.parametrize("operation", ["room", "history", "send"])
async def test_tg64_unauthorized_user_does_not_create_room(
    service: ChatService, env: ChatFakes, operation: str
) -> None:
    env.subscribed = False
    with pytest.raises(ForbiddenError):
        if operation == "room":
            await service.get_or_create_room(env.user, env.event)
        elif operation == "history":
            await service.history(env.user, env.event)
        else:
            await service.send_message(
                env.user,
                env.event,
                "hello",
                client_message_id=uuid.uuid4(),
                author_name=None,
            )
    assert "room" not in env.calls


async def test_tg439_rate_limit_stops_flow(
    service: ChatService, env: ChatFakes
) -> None:
    env.allowed = False
    with pytest.raises(RateLimitedError) as error:
        await service.send_message(
            env.user,
            env.event,
            "hello",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )
    assert error.value.code == RATE_LIMITED
    assert env.calls == ["event", "subscription", "room", "find", "rate"]


async def test_tg439_rejection_stops_flow(service: ChatService, env: ChatFakes) -> None:
    env.approved = False
    with pytest.raises(BusinessRuleViolation) as error:
        await service.send_message(
            env.user,
            env.event,
            "hello",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )
    assert error.value.code == "CHAT_MESSAGE_REJECTED"
    assert env.calls == [
        "event",
        "subscription",
        "room",
        "find",
        "rate",
        "moderate",
    ]
    assert not env.messages and not env.published


async def test_tg442_save_failure_does_not_publish(
    service: ChatService, env: ChatFakes
) -> None:
    env.fail_save = True
    with pytest.raises(ExternalServiceError):
        await service.send_message(
            env.user,
            env.event,
            "hello",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )
    assert "publish" not in env.calls
    assert not env.messages and not env.published


async def test_tg442_publish_failure_keeps_message_with_stable_code(
    service: ChatService, env: ChatFakes
) -> None:
    env.fail_publish = True
    with pytest.raises(ExternalServiceError) as error:
        await service.send_message(
            env.user,
            env.event,
            "hello",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )
    assert error.value.code == "PUBSUB_UNAVAILABLE"
    assert env.calls[-2:] == ["save", "publish"]
    assert [m.text for m in env.messages] == ["hello"]


async def test_tg439_missing_event_is_404_before_subscription(
    service: ChatService, env: ChatFakes
) -> None:
    env.missing = True
    env.subscribed = False
    with pytest.raises(NotFoundError):
        await service.send_message(
            env.user,
            env.event,
            "hello",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )
    assert env.calls == ["event"]


async def test_tg439_room_idempotent_and_missing(
    service: ChatService, env: ChatFakes
) -> None:
    first = await service.get_or_create_room(env.user, env.event)
    second = await service.get_or_create_room(env.user, env.event)
    assert second == first
    env.missing = True
    with pytest.raises(NotFoundError):
        await service.get_or_create_room(env.user, env.event)


async def test_tg453_open_room_returns_the_latest_message(
    service: ChatService, env: ChatFakes
) -> None:
    empty = await service.open_room(env.user, env.event)
    assert empty.room == env.room
    assert empty.last_message is None
    now = datetime.now(UTC)
    env.messages = [
        ChatMessage(
            id=uuid.uuid7(),
            room_id=env.room.id,
            author=ChatAuthor(id=env.user, name=None),
            client_message_id=uuid.uuid4(),
            text=str(i),
            sent_at=now + timedelta(seconds=i),
        )
        for i in range(3)
    ]
    summary = await service.open_room(env.user, env.event)
    assert summary.last_message == env.messages[2]


async def test_tg453_open_room_requires_subscription_and_event(
    service: ChatService, env: ChatFakes
) -> None:
    env.subscribed = False
    with pytest.raises(ForbiddenError):
        await service.open_room(env.user, env.event)
    assert "room" not in env.calls
    env.subscribed = True
    env.missing = True
    with pytest.raises(NotFoundError):
        await service.open_room(env.user, env.event)


async def test_tg439_cursor_order_and_limits(
    service: ChatService, env: ChatFakes
) -> None:
    room = await service.get_or_create_room(env.user, env.event)
    now = datetime.now(UTC)
    env.messages = [
        ChatMessage(
            id=uuid.uuid7(),
            room_id=room.id,
            author=ChatAuthor(id=env.user, name=None),
            client_message_id=uuid.uuid4(),
            text=str(i),
            sent_at=now + timedelta(seconds=i // 2),
        )
        for i in range(55)
    ]
    first = await service.history(env.user, env.event)
    second = await service.history(env.user, env.event, before=first.next_cursor)
    assert len(first.messages) == 50
    assert first.next_cursor is not None
    assert second.next_cursor is None
    assert [m.id for m in first.messages + second.messages] == [
        m.id
        for m in sorted(env.messages, key=lambda m: (m.sent_at, m.id), reverse=True)
    ]
    for cursor in ["bad!", "", "YWJj"]:
        with pytest.raises(ValidationError) as cursor_error:
            await service.history(env.user, env.event, before=cursor)
        assert cursor_error.value.code == CHAT_INVALID_CURSOR
    for limit in [0, 51]:
        with pytest.raises(ValidationError) as limit_error:
            await service.history(env.user, env.event, limit=limit)
        assert limit_error.value.code == CHAT_INVALID_LIMIT


async def test_tg439_list_only_subscribed(service: ChatService, env: ChatFakes) -> None:
    await service.get_or_create_room(env.user, env.event)
    rooms = await service.list_rooms(env.user)
    assert [r.room.event_id for r in rooms] == [env.event]
    assert await service.list_rooms(uuid.uuid7()) == []


def test_tg442_rate_limit_maps_to_http_429() -> None:
    from app.infrastructure.api.error_handlers import resolve_status

    assert resolve_status(RateLimitedError("RATE_LIMITED")) == 429


async def test_tg439_deep_cursor_is_validation_error(
    service: ChatService, env: ChatFakes
) -> None:
    import base64

    cursor = (
        base64.urlsafe_b64encode(("[" * 2000 + "]" * 2000).encode())
        .decode()
        .rstrip("=")
    )
    with pytest.raises(ValidationError):
        await service.history(env.user, env.event, before=cursor)


async def test_tg459_published_envelope_carries_the_origin_of_the_connection(
    service: ChatService, env: ChatFakes
) -> None:
    message = await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=uuid.uuid4(),
        origin="conn-1",
        author_name=None,
    )

    envelope = json.loads(env.published[0])
    assert envelope["from"] == "conn-1"
    assert envelope["frame"]["type"] == "message"
    assert envelope["frame"]["room"] == f"chat:event:{env.event}"
    assert envelope["frame"]["payload"] == message.model_dump(
        mode="json", exclude={"client_message_id"}
    )


@pytest.mark.parametrize("explicit_none", [True, False], ids=["origin=None", "default"])
async def test_tg459_without_origin_the_envelope_has_no_sender(
    service: ChatService, env: ChatFakes, explicit_none: bool
) -> None:
    if explicit_none:
        await service.send_message(
            env.user,
            env.event,
            "hola",
            client_message_id=uuid.uuid4(),
            origin=None,
            author_name=None,
        )
    else:
        await service.send_message(
            env.user,
            env.event,
            "hola",
            client_message_id=uuid.uuid4(),
            author_name=None,
        )

    assert json.loads(env.published[0])["from"] is None


# --- TG-654: idempotencia de l'enviament (client_message_id) --------------------


def _stored(env: ChatFakes, **overrides: object) -> ChatMessage:
    """A message already stored for ``env.user`` under a ``client_message_id``."""
    fields: dict[str, object] = {
        "id": uuid.uuid7(),
        "room_id": env.room.id,
        "author": ChatAuthor(id=env.user, name=None),
        "client_message_id": uuid.uuid4(),
        "text": "hola",
        "sent_at": datetime.now(UTC) - timedelta(minutes=1),
    }
    fields.update(overrides)
    return ChatMessage(**fields)


async def test_tg654_a_new_message_keeps_the_client_message_id_and_looks_up_first(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: el flux normal desa la clau; la cerca va abans de limiter i moderador
    key = uuid.uuid4()

    message = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert message.client_message_id == key
    assert env.messages == [message]
    assert env.calls == [
        "event",
        "subscription",
        "room",
        "find",
        "rate",
        "moderate",
        "save",
        "publish",
        "mark",
    ]


async def test_tg654_an_identical_retry_returns_the_stored_message_without_new_work(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: duplicat identic = no modera, no compta al rate limit, no desa; dins del
    # cooldown (el primer publish consta) tampoc no es torna a publicar
    key = uuid.uuid4()
    first = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )
    env.calls.clear()

    second = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert (second.id, second.sent_at) == (first.id, first.sent_at)
    assert env.messages == [first]
    assert env.calls == ["event", "subscription", "room", "find", "recent"]
    assert len(env.published) == 1


async def test_tg654_an_identical_retry_republishes_the_original_message(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: es republica (fora del cooldown): la primera difusio potser no va arribar
    key = uuid.uuid4()
    first = await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=key,
        origin="conn-1",
        author_name=None,
    )
    env.recent.clear()  # the cooldown is over (or the mark was lost)
    env.calls.clear()

    await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=key,
        origin="conn-2",
        author_name=None,
    )

    assert len(env.published) == 2
    envelope = json.loads(env.published[1])
    assert envelope["from"] == "conn-2"
    assert envelope["frame"]["room"] == f"chat:event:{env.event}"
    assert envelope["frame"]["payload"] == first.model_dump(
        mode="json", exclude={"client_message_id"}
    )
    assert env.calls == [
        "event",
        "subscription",
        "room",
        "find",
        "recent",
        "publish",
        "mark",
    ]


async def test_tg654_a_retry_is_identical_when_the_cleaned_text_is_the_same(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: es compara el text net (retallat), no el cru
    key = uuid.uuid4()
    first = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    second = await service.send_message(
        env.user, env.event, "  hola \n", client_message_id=key, author_name=None
    )

    assert second.id == first.id
    assert env.messages == [first]


async def test_tg654_an_identical_retry_ignores_rate_limit_and_moderator(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: ni un limit esgotat ni un moderador que ara rebutjaria bloquegen el retry
    key = uuid.uuid4()
    first = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )
    env.allowed = False
    env.approved = False
    env.calls.clear()

    second = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert second.id == first.id
    assert "rate" not in env.calls
    assert "moderate" not in env.calls


async def test_tg654_an_identical_retry_still_reports_a_pubsub_failure(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: si la republicacio falla, el client ha de poder tornar a provar
    key = uuid.uuid4()
    await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )
    env.recent.clear()
    env.fail_publish = True
    env.calls.clear()

    with pytest.raises(ExternalServiceError) as error:
        await service.send_message(
            env.user, env.event, "hola", client_message_id=key, author_name=None
        )

    assert error.value.code == "PUBSUB_UNAVAILABLE"
    assert len(env.messages) == 1
    assert "mark" not in env.calls


async def test_tg654_the_same_key_with_another_text_is_an_idempotency_conflict(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: ConflictError (409) amb codi nou; no desa, no modera, no republica
    key = uuid.uuid4()
    first = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )
    env.calls.clear()

    with pytest.raises(ConflictError) as error:
        await service.send_message(
            env.user,
            env.event,
            "un altre text",
            client_message_id=key,
            author_name=None,
        )

    assert error.value.code == "CHAT_IDEMPOTENCY_CONFLICT"
    assert env.messages == [first]
    assert len(env.published) == 1
    assert env.calls == ["event", "subscription", "room", "find"]


async def test_tg654_the_same_key_in_another_room_is_an_idempotency_conflict(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: mateixa clau i mateix text, pero el missatge desat es d'una altra sala
    key = uuid.uuid4()
    elsewhere = _stored(env, room_id=uuid.uuid7(), client_message_id=key)
    env.messages.append(elsewhere)

    with pytest.raises(ConflictError) as error:
        await service.send_message(
            env.user, env.event, "hola", client_message_id=key, author_name=None
        )

    assert error.value.code == "CHAT_IDEMPOTENCY_CONFLICT"
    assert env.messages == [elsewhere]
    assert env.published == []
    assert "save" not in env.calls


async def test_tg654_the_same_key_of_another_author_is_not_a_duplicate(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: la unicitat es per (autor, clau)
    key = uuid.uuid4()
    env.messages.append(
        _stored(
            env, author=ChatAuthor(id=uuid.uuid7(), name=None), client_message_id=key
        )
    )

    message = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert message.author.id == env.user
    assert len(env.messages) == 2
    assert env.calls[-5:] == ["rate", "moderate", "save", "publish", "mark"]


async def test_tg654_an_invalid_text_is_rejected_before_looking_up_the_key(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: la validacio del text segueix abans de qualsevol cerca
    with pytest.raises(ValidationError):
        await service.send_message(
            env.user, env.event, "  ", client_message_id=uuid.uuid4(), author_name=None
        )

    assert env.calls == ["event", "subscription", "room"]


def test_tg654_idempotency_conflict_is_http_409_and_a_known_realtime_code() -> None:
    # TG-654: 409 a REST i al frame d'error del WebSocket (codi conegut)
    from app.application.realtime.errors import error_frame, is_known
    from app.infrastructure.api.error_handlers import resolve_status

    assert resolve_status(ConflictError("CHAT_IDEMPOTENCY_CONFLICT")) == 409
    assert is_known("CHAT_IDEMPOTENCY_CONFLICT")
    frame = error_frame("CHAT_IDEMPOTENCY_CONFLICT", "conflict", correlation_id="c-1")
    assert frame.payload["status"] == 409
    assert frame.payload["code"] == "CHAT_IDEMPOTENCY_CONFLICT"


async def test_tg654_the_published_frame_does_not_carry_the_client_message_id(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: els receptors dedupliquen per id; la clau del client no es difon
    await service.send_message(
        env.user, env.event, "hola", client_message_id=uuid.uuid4(), author_name=None
    )

    payload = json.loads(env.published[0])["frame"]["payload"]
    assert "client_message_id" not in payload
    assert set(payload) == {"id", "room_id", "author", "text", "sent_at"}


async def test_tg654_when_a_concurrent_retry_wins_its_message_is_published_and_returned(
    service: ChatService, env: ChatFakes
) -> None:
    # TG-654: add_message retorna el desat; si ha perdut la cursa no es el construit
    key = uuid.uuid4()
    winner = _stored(env, client_message_id=key, sent_at=datetime.now(UTC))
    env.race_winner = winner

    message = await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=key,
        origin="conn-9",
        author_name=None,
    )

    assert message == winner
    envelope = json.loads(env.published[0])
    assert envelope["from"] == "conn-9"
    assert envelope["frame"]["payload"]["id"] == str(winner.id)
    assert (
        envelope["frame"]["payload"]["sent_at"]
        == winner.model_dump(mode="json")["sent_at"]
    )


# --- TG-654: cursa i limit de republicacio -------------------------------------


def test_tg654_the_republish_cooldown_is_10_seconds() -> None:
    from app.application.chat.chat_service import REPUBLISH_COOLDOWN_SECONDS

    assert REPUBLISH_COOLDOWN_SECONDS == 10


@pytest.mark.parametrize(
    "overrides",
    [{"text": "un altre text"}, {"room_id": uuid.uuid7()}],
    ids=["other-text", "other-room"],
)
async def test_tg654_a_race_winner_with_another_text_or_room_is_a_conflict(
    service: ChatService, env: ChatFakes, overrides: dict[str, object]
) -> None:
    # TG-654: add_message torna un guanyador que no es el que s'ha enviat: conflicte
    key = uuid.uuid4()
    winner = _stored(env, client_message_id=key, **overrides)
    env.race_winner = winner

    with pytest.raises(ConflictError) as error:
        await service.send_message(
            env.user, env.event, "hola", client_message_id=key, author_name=None
        )

    assert error.value.code == "CHAT_IDEMPOTENCY_CONFLICT"
    assert env.published == []
    assert "publish" not in env.calls
    assert "mark" not in env.calls


async def test_tg654_a_race_winner_with_the_same_text_and_room_is_published_and_marked(
    service: ChatService, env: ChatFakes
) -> None:
    key = uuid.uuid4()
    winner = _stored(env, client_message_id=key)
    env.race_winner = winner

    message = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert message == winner
    assert env.calls[-2:] == ["publish", "mark"]
    assert (env.user, key) in env.recent


async def test_tg654_a_successful_publish_marks_the_message_as_published(
    service: ChatService, env: ChatFakes
) -> None:
    key = uuid.uuid4()

    await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert env.recent == {(env.user, key)}


async def test_tg654_a_failure_marking_is_ignored_because_the_publish_went_out(
    service: ChatService, env: ChatFakes
) -> None:
    env.fail_mark = True

    message = await service.send_message(
        env.user, env.event, "hola", client_message_id=uuid.uuid4(), author_name=None
    )

    assert env.messages == [message]
    assert len(env.published) == 1


async def test_tg654_a_failed_publish_is_not_marked_and_the_retry_publishes_again(
    service: ChatService, env: ChatFakes
) -> None:
    key = uuid.uuid4()
    env.fail_publish = True
    with pytest.raises(ExternalServiceError):
        await service.send_message(
            env.user, env.event, "hola", client_message_id=key, author_name=None
        )
    assert env.recent == set()
    env.fail_publish = False
    env.calls.clear()

    message = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )

    assert env.calls == [
        "event",
        "subscription",
        "room",
        "find",
        "recent",
        "publish",
        "mark",
    ]
    assert len(env.messages) == 1
    assert env.messages == [message]
    assert len(env.published) == 1


async def test_tg654_an_identical_retry_inside_the_cooldown_does_not_publish(
    service: ChatService, env: ChatFakes
) -> None:
    key = uuid.uuid4()
    first = await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )
    env.calls.clear()

    second = await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=key,
        origin="conn-2",
        author_name=None,
    )

    assert second == first
    assert env.calls == ["event", "subscription", "room", "find", "recent"]
    assert len(env.published) == 1


async def test_tg654_a_failure_asking_the_guard_is_pubsub_unavailable(
    service: ChatService, env: ChatFakes
) -> None:
    key = uuid.uuid4()
    await service.send_message(
        env.user, env.event, "hola", client_message_id=key, author_name=None
    )
    env.fail_recent = True

    with pytest.raises(ExternalServiceError) as error:
        await service.send_message(
            env.user, env.event, "hola", client_message_id=key, author_name=None
        )

    assert error.value.code == "PUBSUB_UNAVAILABLE"
    assert len(env.published) == 1


# --- TG-64 / TG-469: l'autor del missatge porta el nom del perfil ----------------


async def test_tg469_send_message_builds_the_author_from_the_profile_name(
    service: ChatService, env: ChatFakes
) -> None:
    message = await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=uuid.uuid4(),
        author_name="Ada",
    )

    assert message.author == ChatAuthor(id=env.user, name="Ada")
    assert env.messages == [message]


async def test_tg469_send_message_without_profile_name_has_a_null_name(
    service: ChatService, env: ChatFakes
) -> None:
    message = await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=uuid.uuid4(),
        author_name=None,
    )

    assert message.author == ChatAuthor(id=env.user, name=None)


async def test_tg469_the_published_frame_carries_the_author_id_and_name(
    service: ChatService, env: ChatFakes
) -> None:
    await service.send_message(
        env.user,
        env.event,
        "hola",
        client_message_id=uuid.uuid4(),
        author_name="Ada",
    )

    payload = json.loads(env.published[0])["frame"]["payload"]
    assert payload["author"] == {"id": str(env.user), "name": "Ada"}
    assert "author_id" not in payload
