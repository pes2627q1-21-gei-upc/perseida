"""REST API of the event chat with PostgreSQL and Redis for real (TG-453, US #64).

Written first (TDD, ADR-0028): the router of ``app/infrastructure/chat`` does not
exist yet, so these tests go through red and are the contract of TG-455. Only
Google is simulated (respx + a throwaway RSA key); the app is wired as the
lifespan does it, with the real session store, user repository and chat tables.
Everything runs inside one transaction per test that is rolled back, so no row of
this module is left behind.

429 ``RATE_LIMITED`` is not tested here: REST has no endpoint to send a message
(sending goes through the WebSocket), so the limit cannot be hit over REST.
The clock is not frozen: the events are seeded relative to now (UTC).
"""

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
from app.domain.chat.errors import CHAT_INVALID_CURSOR, CHAT_INVALID_LIMIT
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

PROBLEM_JSON = "application/problem+json"
ROOMS = "/api/chat/rooms"
# Redis database only for these tests (the app uses 0), emptied before and after.
TEST_REDIS_DB = 15
# Fixed history timestamps; three messages share each second to exercise the id
# tie-break of the cursor.
NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
HISTORY_SIZE = 120
INSERT_EVENT = text(
    "INSERT INTO astronomical_events"
    " (id, source, external_id, title, summary, category, starts_at, ends_at)"
    " VALUES (:id, 'catalog', :external_id, :title, 'An astronomical event.',"
    " 'lunar', :starts_at, :ends_at)"
)
INSERT_SUBSCRIPTION = text(
    "INSERT INTO event_subscriptions (id, user_id, event_id, created_at)"
    " VALUES (:id, :user_id, :event_id, :created_at)"
)
INSERT_ROOM = text(
    "INSERT INTO event_chat_rooms (id, event_id, created_at)"
    " VALUES (:id, :event_id, :created_at)"
)
INSERT_MESSAGE = text(
    "INSERT INTO chat_messages (id, room_id, author_id, text, sent_at)"
    " VALUES (:id, :room_id, :author_id, :body, :sent_at)"
)
COUNT_ROOMS_OF_EVENT = text(
    "SELECT count(*) FROM event_chat_rooms WHERE event_id = :event_id"
)


def room_of(event_id: uuid.UUID | str) -> str:
    return f"/api/events/{event_id}/chat/room"


def messages_of(event_id: uuid.UUID | str) -> str:
    return f"/api/events/{event_id}/chat/messages"


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[3]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
def google_certs() -> Iterator[respx.Route]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    # The tests must leave the configured database as they found it.
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def connection() -> AsyncIterator[AsyncConnection]:
    """One connection inside a transaction that is rolled back after the test."""
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                yield connection
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
def factory(connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    # Each commit of the app becomes a savepoint of the test's transaction.
    return async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    """A Redis database only for these tests, emptied before and after."""
    client = Redis.from_url(
        RedisSettings().redis_url, db=TEST_REDIS_DB, decode_responses=True
    )
    try:
        await client.flushdb()
        yield client
    finally:
        await client.flushdb()
        await client.aclose()


@pytest.fixture
async def app(
    google_certs: respx.Route,
    factory: async_sessionmaker[AsyncSession],
    redis: Redis,
) -> AsyncIterator[FastAPI]:
    users = build_user_service(factory)
    async with httpx.AsyncClient() as google:
        application: FastAPI = create_app()
        # The chat service is built per request from the session factory and the
        # Redis client of the app state (limiter and pub/sub).
        application.state.session_factory = factory
        application.state.redis = redis
        application.state.cache_default_ttl_seconds = 60
        application.state.user_service = users
        application.state.auth_service = AuthService(
            GoogleJwksVerifier(google, [CLIENT_ID]),
            JwtTokenCodec("s" * 40),
            RedisSessionStore(redis, RedisPubSub(redis)),
            UserAccountGateway(users),
            SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
        )
        yield application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http


async def login_headers(client: AsyncClient) -> dict[str, str]:
    sub = f"it-{uuid.uuid4().hex}"
    id_token = token(sub=sub, email=f"{sub}@example.test", name="Ana")
    response = await client.post("/api/auth/google", json={"id_token": id_token})
    tokens: dict[str, Any] = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def user_id_of(client: AsyncClient, headers: dict[str, str]) -> uuid.UUID:
    response = await client.get("/api/users/me", headers=headers)
    return uuid.UUID(response.json()["id"])


async def seed_event(connection: AsyncConnection) -> uuid.UUID:
    """Store an event that starts in two days; return its id."""
    event_id = uuid.uuid7()
    starts_at = datetime.now(UTC) + timedelta(days=2)
    await connection.execute(
        INSERT_EVENT,
        {
            "id": event_id,
            "external_id": f"it-chat-api-{event_id}",
            "title": f"Event {event_id}",
            "starts_at": starts_at,
            "ends_at": starts_at + timedelta(hours=2),
        },
    )
    return event_id


async def subscribe(
    connection: AsyncConnection, user_id: uuid.UUID, event_id: uuid.UUID
) -> None:
    await connection.execute(
        INSERT_SUBSCRIPTION,
        {
            "id": uuid.uuid7(),
            "user_id": user_id,
            "event_id": event_id,
            "created_at": datetime.now(UTC),
        },
    )


async def seed_room(
    connection: AsyncConnection, event_id: uuid.UUID, created_at: datetime = NOW
) -> uuid.UUID:
    room_id = uuid.uuid7()
    await connection.execute(
        INSERT_ROOM,
        {"id": room_id, "event_id": event_id, "created_at": created_at},
    )
    return room_id


async def seed_message(
    connection: AsyncConnection,
    room_id: uuid.UUID,
    author_id: uuid.UUID,
    sent_at: datetime,
    body: str = "Hola",
) -> uuid.UUID:
    message_id = uuid.uuid7()
    await connection.execute(
        INSERT_MESSAGE,
        {
            "id": message_id,
            "room_id": room_id,
            "author_id": author_id,
            "body": body,
            "sent_at": sent_at,
        },
    )
    return message_id


async def subscribed_event(
    client: AsyncClient, connection: AsyncConnection, headers: dict[str, str]
) -> uuid.UUID:
    """An event the user of ``headers`` is subscribed to."""
    event_id = await seed_event(connection)
    await subscribe(connection, await user_id_of(client, headers), event_id)
    return event_id


async def seed_history(
    connection: AsyncConnection, room_id: uuid.UUID, author_id: uuid.UUID, size: int
) -> list[uuid.UUID]:
    """``size`` messages, three per second; returns the ids newest first."""
    rows: list[dict[str, Any]] = [
        {
            "id": uuid.uuid7(),
            "room_id": room_id,
            "author_id": author_id,
            "body": f"m{index}",
            "sent_at": NOW + timedelta(seconds=index // 3),
        }
        for index in range(size)
    ]
    await connection.execute(INSERT_MESSAGE, rows)
    ordered = sorted(rows, key=lambda row: (row["sent_at"], row["id"]), reverse=True)
    return [row["id"] for row in ordered]


async def rooms_count(connection: AsyncConnection, event_id: uuid.UUID) -> int:
    rows = await connection.execute(COUNT_ROOMS_OF_EVENT, {"event_id": event_id})
    return int(rows.scalar_one())


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


def ids(messages: list[dict[str, Any]]) -> list[str]:
    return [message["id"] for message in messages]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", ROOMS),
        ("PUT", room_of(uuid.uuid7())),
        ("GET", messages_of(uuid.uuid7())),
    ],
    ids=["list-rooms", "put-room", "history"],
)
async def test_tg453_c1_chat_endpoints_without_a_token_are_401(
    client: AsyncClient, method: str, path: str
) -> None:
    # testing.md: endpoints privats sense sessio -> 100 % rebutjats
    response = await client.request(method, path)

    assert_problem(response, 401, INVALID_SESSION)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", ROOMS),
        ("PUT", room_of(uuid.uuid7())),
        ("GET", messages_of(uuid.uuid7())),
    ],
    ids=["list-rooms", "put-room", "history"],
)
async def test_tg453_c1_chat_endpoints_with_a_bad_token_are_401(
    client: AsyncClient, method: str, path: str
) -> None:
    response = await client.request(
        method, path, headers={"Authorization": "Bearer not-a-valid-token"}
    )

    assert_problem(response, 401, INVALID_SESSION)


async def test_tg453_c2_put_room_creates_it_and_returns_the_same_one_after(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)

    first = await client.put(room_of(event_id), headers=headers)
    second = await client.put(room_of(event_id), headers=headers)

    assert (first.status_code, second.status_code) == (200, 200)
    assert first.json()["event_id"] == str(event_id)
    assert second.json()["id"] == first.json()["id"]
    assert await rooms_count(connection, event_id) == 1


async def test_tg453_c2_put_room_returns_the_room_that_already_exists(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)
    existing = await seed_room(connection, event_id)

    response = await client.put(room_of(event_id), headers=headers)

    assert response.status_code == 200
    assert response.json()["id"] == str(existing)
    assert await rooms_count(connection, event_id) == 1


async def test_tg453_c2_two_users_of_an_event_share_its_room(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    event_id = await subscribed_event(client, connection, ana)
    await subscribe(connection, await user_id_of(client, bob), event_id)

    first = await client.put(room_of(event_id), headers=ana)
    second = await client.put(room_of(event_id), headers=bob)

    assert second.json()["id"] == first.json()["id"]
    assert await rooms_count(connection, event_id) == 1


async def test_tg453_c3_put_room_of_an_unknown_event_is_404(
    client: AsyncClient,
) -> None:
    headers = await login_headers(client)

    response = await client.put(room_of(uuid.uuid7()), headers=headers)

    assert_problem(response, 404, "EVENT_NOT_FOUND")


async def test_tg453_c3_put_room_when_not_subscribed_is_403_and_creates_nothing(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await seed_event(connection)

    response = await client.put(room_of(event_id), headers=headers)

    assert_problem(response, 403, "FORBIDDEN")
    assert await rooms_count(connection, event_id) == 0


async def test_tg453_c3_subscription_of_another_user_does_not_open_the_room(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    event_id = await subscribed_event(client, connection, ana)

    response = await client.put(room_of(event_id), headers=bob)

    assert_problem(response, 403, "FORBIDDEN")
    assert await rooms_count(connection, event_id) == 0


async def test_tg453_c4_history_of_an_empty_room_is_an_empty_list_without_cursor(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)
    await seed_room(connection, event_id)

    response = await client.get(messages_of(event_id), headers=headers)

    assert response.status_code == 200
    assert response.json() == {"messages": [], "next_cursor": None}


async def test_tg453_c4_history_is_newest_first_with_the_message_fields(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    room_id = await seed_room(connection, event_id)
    oldest = await seed_message(connection, room_id, author, NOW, "primer")
    newest = await seed_message(
        connection, room_id, author, NOW + timedelta(minutes=1), "segon"
    )

    response = await client.get(messages_of(event_id), headers=headers)

    body = response.json()
    assert response.status_code == 200
    assert ids(body["messages"]) == [str(newest), str(oldest)]
    assert body["next_cursor"] is None
    first = body["messages"][0]
    assert first["room_id"] == str(room_id)
    assert first["author_id"] == str(author)
    assert first["text"] == "segon"
    assert datetime.fromisoformat(first["sent_at"]) == NOW + timedelta(minutes=1)


async def test_tg453_c4_history_does_not_include_other_rooms(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    other_event = await seed_event(connection)
    mine = await seed_message(
        connection, await seed_room(connection, event_id), author, NOW
    )
    await seed_message(
        connection, await seed_room(connection, other_event), author, NOW
    )

    response = await client.get(messages_of(event_id), headers=headers)

    assert ids(response.json()["messages"]) == [str(mine)]


async def test_tg453_c4_history_creates_the_room_when_it_does_not_exist_yet(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)

    response = await client.get(messages_of(event_id), headers=headers)

    assert response.status_code == 200
    assert response.json() == {"messages": [], "next_cursor": None}
    assert await rooms_count(connection, event_id) == 1


async def test_tg453_c5_the_default_page_has_50_messages_and_a_next_cursor(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    room_id = await seed_room(connection, event_id)
    expected = await seed_history(connection, room_id, author, 60)

    response = await client.get(messages_of(event_id), headers=headers)

    body = response.json()
    assert response.status_code == 200
    assert ids(body["messages"]) == [str(i) for i in expected[:50]]
    assert isinstance(body["next_cursor"], str)


async def test_tg453_c5_limit_shortens_the_page(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    room_id = await seed_room(connection, event_id)
    expected = await seed_history(connection, room_id, author, 12)

    response = await client.get(
        messages_of(event_id), params={"limit": 10}, headers=headers
    )

    body = response.json()
    assert ids(body["messages"]) == [str(i) for i in expected[:10]]
    assert isinstance(body["next_cursor"], str)


async def test_tg453_c5_a_page_of_exactly_the_limit_that_ends_the_history_has_no_cursor(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    room_id = await seed_room(connection, event_id)
    await seed_history(connection, room_id, author, 50)

    response = await client.get(messages_of(event_id), headers=headers)

    body = response.json()
    assert len(body["messages"]) == 50
    assert body["next_cursor"] is None


async def test_tg453_c6_paging_120_messages_has_no_gaps_or_repeats(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    room_id = await seed_room(connection, event_id)
    expected = await seed_history(connection, room_id, author, HISTORY_SIZE)

    pages: list[list[str]] = []
    cursor: str | None = None
    for _ in range(5):
        params: dict[str, str | int] = {"limit": 50}
        if cursor is not None:
            params["before"] = cursor
        response = await client.get(
            messages_of(event_id), params=params, headers=headers
        )
        assert response.status_code == 200
        pages.append(ids(response.json()["messages"]))
        cursor = response.json()["next_cursor"]
        if cursor is None:
            break

    assert [len(page) for page in pages] == [50, 50, 20]
    assert [i for page in pages for i in page] == [str(i) for i in expected]
    assert cursor is None


@pytest.mark.parametrize("limit", [0, 51, -1, 1000])
async def test_tg453_c7_a_limit_out_of_range_is_422(
    client: AsyncClient, connection: AsyncConnection, limit: int
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)

    response = await client.get(
        messages_of(event_id), params={"limit": limit}, headers=headers
    )

    assert_problem(response, 422, CHAT_INVALID_LIMIT)


@pytest.mark.parametrize("limit", [1, 50])
async def test_tg453_c7_the_limits_of_the_range_are_accepted(
    client: AsyncClient, connection: AsyncConnection, limit: int
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)

    response = await client.get(
        messages_of(event_id), params={"limit": limit}, headers=headers
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    "cursor",
    [
        "not-a-cursor!",
        "bm90LWpzb24",  # valid base64url of "not-json"
        "W10",  # valid base64url of "[]"
        "x" * 300,
    ],
    ids=["not-base64", "not-json", "wrong-shape", "too-long"],
)
async def test_tg453_c7_an_invalid_cursor_is_422(
    client: AsyncClient, connection: AsyncConnection, cursor: str
) -> None:
    headers = await login_headers(client)
    event_id = await subscribed_event(client, connection, headers)

    response = await client.get(
        messages_of(event_id), params={"before": cursor}, headers=headers
    )

    assert_problem(response, 422, CHAT_INVALID_CURSOR)


async def test_tg453_c8_history_of_an_unknown_event_is_404(
    client: AsyncClient,
) -> None:
    headers = await login_headers(client)

    response = await client.get(messages_of(uuid.uuid7()), headers=headers)

    assert_problem(response, 404, "EVENT_NOT_FOUND")


async def test_tg453_c8_history_when_not_subscribed_is_403_without_its_content(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    event_id = await subscribed_event(client, connection, ana)
    room_id = await seed_room(connection, event_id)
    secret = "contingut-privat-del-xat"
    await seed_message(connection, room_id, await user_id_of(client, ana), NOW, secret)

    response = await client.get(messages_of(event_id), headers=bob)

    assert_problem(response, 403, "FORBIDDEN")
    assert secret not in response.text
    assert "messages" not in response.json()


async def test_tg453_c8_history_when_not_subscribed_creates_no_room(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await seed_event(connection)

    response = await client.get(messages_of(event_id), headers=headers)

    assert_problem(response, 403, "FORBIDDEN")
    assert await rooms_count(connection, event_id) == 0


async def test_tg453_c8_after_unsubscribing_the_history_is_forbidden(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    await seed_message(
        connection, await seed_room(connection, event_id), author, NOW, "hola"
    )
    assert (await client.get(messages_of(event_id), headers=headers)).status_code == 200

    unsubscribed = await client.delete(
        f"/api/events/{event_id}/subscription", headers=headers
    )
    response = await client.get(messages_of(event_id), headers=headers)

    assert unsubscribed.status_code == 204
    assert_problem(response, 403, "FORBIDDEN")


async def test_tg453_c9_rooms_are_the_subscribed_ones_by_last_message_newest_first(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    me = await login_headers(client)
    other = await login_headers(client)
    me_id, other_id = await user_id_of(client, me), await user_id_of(client, other)
    older, newer, silent, no_room, not_subscribed, not_mine = [
        await seed_event(connection) for _ in range(6)
    ]
    for event_id in (older, newer, silent, no_room):
        await subscribe(connection, me_id, event_id)
    await subscribe(connection, other_id, not_mine)
    older_room = await seed_room(connection, older)
    newer_room = await seed_room(connection, newer)
    silent_room = await seed_room(connection, silent)
    await seed_room(connection, not_subscribed)
    not_mine_room = await seed_room(connection, not_mine)
    await seed_message(connection, older_room, me_id, NOW, "antic")
    newer_last = await seed_message(
        connection, newer_room, other_id, NOW + timedelta(minutes=5), "ultim"
    )
    await seed_message(connection, newer_room, me_id, NOW + timedelta(minutes=2))
    await seed_message(connection, not_mine_room, other_id, NOW + timedelta(hours=9))

    response = await client.get(ROOMS, headers=me)

    body = response.json()
    assert response.status_code == 200
    assert [room["id"] for room in body] == [
        str(newer_room),
        str(older_room),
        str(silent_room),
    ]
    assert [room["event_id"] for room in body] == [
        str(newer),
        str(older),
        str(silent),
    ]
    assert body[0]["last_message"]["id"] == str(newer_last)
    assert body[0]["last_message"]["text"] == "ultim"
    assert body[1]["last_message"]["text"] == "antic"
    assert body[2]["last_message"] is None


async def test_tg453_c9_a_user_without_subscriptions_has_no_rooms(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    await seed_room(connection, await seed_event(connection))

    response = await client.get(ROOMS, headers=headers)

    assert response.status_code == 200
    assert response.json() == []


async def test_tg453_c10_history_and_rooms_still_answer_200_with_redis_down(
    app: FastAPI, client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    author = await user_id_of(client, headers)
    event_id = await subscribed_event(client, connection, headers)
    room_id = await seed_room(connection, event_id)
    message = await seed_message(connection, room_id, author, NOW, "guardat")
    # The Redis of the chat (limiter and pub/sub) is unreachable; the session store
    # that authenticates the request keeps working.
    dead = Redis.from_url(
        "redis://127.0.0.1:1", socket_connect_timeout=0.5, socket_timeout=0.5
    )
    app.state.redis = dead
    try:
        history = await client.get(messages_of(event_id), headers=headers)
        rooms = await client.get(ROOMS, headers=headers)
        room = await client.put(room_of(event_id), headers=headers)
    finally:
        await dead.aclose()

    assert history.status_code == 200
    assert ids(history.json()["messages"]) == [str(message)]
    assert rooms.status_code == 200
    assert [r["id"] for r in rooms.json()] == [str(room_id)]
    assert room.status_code == 200
    assert room.json()["id"] == str(room_id)
