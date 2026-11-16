"""Daily quiz API with PostgreSQL and Redis for real (TG-60).

Only Google is simulated (respx + a throwaway RSA key). The clock of the quiz
service is fixed so that "today" is known.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
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
from app.application.auth.errors import INVALID_SESSION, SESSION_UNAVAILABLE
from app.application.quiz.quiz_service import QuizService
from app.domain.quiz.rules import (
    QUIZ_ALREADY_ANSWERED,
    QUIZ_EXPIRED,
    QUIZ_QUESTION_MISMATCH,
)
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_cache import RedisCache
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.quiz.dependencies import get_quiz_service
from app.infrastructure.quiz.repository import (
    SqlQuizAnswerRepository,
    SqlQuizDayRepository,
    SqlQuizQuestionRepository,
)
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
NOW = datetime(2026, 11, 9, 10, 0, tzinfo=UTC)
TODAY = NOW.date().isoformat()
SOLUTION_FIELDS = {"correct_option", "explanation", "source_url"}
EXTRA_ID = uuid.UUID("01a1bd9a-ffff-7000-8000-000000000000")
# Nothing listens on port 1: every call to this Redis fails, as when it is down.
DOWN_REDIS_URL = "redis://127.0.0.1:1/0"
# Redis database only for these tests (the app uses 0), emptied before and after.
TEST_REDIS_DB = 15
ROLLBACK_PREFIX = "quiz-rollback"
DAY_EXISTS = text("SELECT EXISTS (SELECT 1 FROM quiz_days WHERE quiz_date = :day)")
DELETE_DAY = text("DELETE FROM quiz_days WHERE quiz_date = :day")
COUNT_ANSWERS = text(
    "SELECT count(*) FROM quiz_answers a JOIN users u ON u.id = a.user_id"
    " WHERE u.email LIKE :prefix"
)
CLEAN_ROLLBACK_USERS = (
    text(
        "DELETE FROM quiz_answers WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM user_identities WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text("DELETE FROM users WHERE email LIKE :prefix"),
)


def _alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    return config


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    command.upgrade(_alembic_config(), "head")


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


def build_app(
    factory: async_sessionmaker[AsyncSession], redis: Redis, google: httpx.AsyncClient
) -> FastAPI:
    """The real app, with sessions and the quiz cache on ``redis``."""
    users = build_user_service(factory)
    quiz = QuizService(
        SqlQuizQuestionRepository(factory),
        SqlQuizDayRepository(factory),
        SqlQuizAnswerRepository(factory),
        RedisCache(redis, 3600),
        now=lambda: NOW,
    )
    app: FastAPI = create_app()
    app.state.user_service = users
    app.state.auth_service = AuthService(
        GoogleJwksVerifier(google, [CLIENT_ID]),
        JwtTokenCodec("q" * 40),
        RedisSessionStore(redis, RedisPubSub(redis)),
        UserAccountGateway(users),
        SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
    )
    app.dependency_overrides[get_quiz_service] = lambda: quiz
    return app


@asynccontextmanager
async def serve(
    factory: async_sessionmaker[AsyncSession], redis: Redis
) -> AsyncIterator[AsyncClient]:
    async with httpx.AsyncClient() as google:
        app = build_app(factory, redis, google)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http


@pytest.fixture
async def client(
    google_certs: respx.Route, factory: async_sessionmaker[AsyncSession], redis: Redis
) -> AsyncIterator[AsyncClient]:
    async with serve(factory, redis) as http:
        yield http


async def login(
    client: AsyncClient, prefix: str = "quiz", **body: Any
) -> dict[str, str]:
    sub = f"{prefix}-{uuid.uuid4().hex}"
    id_token = token(sub=sub, email=f"{sub}@example.test", name="Ana")
    response = await client.post(
        "/api/auth/google", json={"id_token": id_token, **body}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def answer(
    client: AsyncClient, headers: dict[str, str], **changes: Any
) -> Response:
    question = (await client.get("/api/quiz/today", headers=headers)).json()
    body = {"date": TODAY, "question_id": question["question_id"], "chosen_option": 0}
    return await client.post(
        "/api/quiz/today/answer", headers=headers, json=body | changes
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/api/quiz/today"), ("POST", "/api/quiz/today/answer")],
)
async def test_tg60_c10_without_a_session_it_is_a_401(
    client: AsyncClient, method: str, path: str
) -> None:
    response = await client.request(method, path, json={})

    assert_problem(response, 401, INVALID_SESSION)


async def test_tg60_c1_c4_today_returns_the_question_without_its_solution(
    client: AsyncClient,
) -> None:
    headers = await login(client)

    response = await client.get("/api/quiz/today?lang=en", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == TODAY
    assert body["language"] == "en"
    assert body["statement"]
    assert len(body["options"]) == 4
    assert body["result"] is None
    assert not SOLUTION_FIELDS & body.keys()


async def test_without_lang_it_uses_the_preferred_language(client: AsyncClient) -> None:
    headers = await login(client, language="es")

    body = (await client.get("/api/quiz/today", headers=headers)).json()

    assert body["language"] == "es"


async def test_tg60_c2_every_user_and_language_gets_the_same_question(
    client: AsyncClient,
) -> None:
    first, second = await login(client), await login(client)

    ids = {
        (await client.get(f"/api/quiz/today?lang={lang}", headers=headers)).json()[
            "question_id"
        ]
        for headers in (first, second)
        for lang in ("ca", "es", "en")
    }

    assert len(ids) == 1


async def test_tg60_c5_c7_an_answer_returns_the_result_and_today_shows_it(
    client: AsyncClient,
) -> None:
    headers = await login(client)

    response = await answer(client, headers, chosen_option=2)

    assert response.status_code == 201
    result = response.json()
    assert result["chosen_option"] == 2
    assert result["correct"] is (result["correct_option"] == 2)
    assert result["explanation"]
    assert result["source_url"].startswith("https://")
    today = (await client.get("/api/quiz/today", headers=headers)).json()
    assert today["result"] == result


async def test_tg60_c6_a_second_answer_is_a_409(client: AsyncClient) -> None:
    headers = await login(client)
    await answer(client, headers)

    assert_problem(await answer(client, headers), 409, QUIZ_ALREADY_ANSWERED)


async def test_tg60_c8_another_day_is_a_409(client: AsyncClient) -> None:
    headers = await login(client)
    yesterday = (NOW - timedelta(days=1)).date().isoformat()

    assert_problem(await answer(client, headers, date=yesterday), 409, QUIZ_EXPIRED)


async def test_tg60_c9_another_question_is_a_422(client: AsyncClient) -> None:
    headers = await login(client)

    response = await answer(client, headers, question_id=str(uuid.UUID(int=1)))

    assert_problem(response, 422, QUIZ_QUESTION_MISMATCH)


@pytest.mark.parametrize(
    ("path", "changes"),
    [
        ("/api/quiz/today?lang=fr", {}),
        ("/api/quiz/today/answer", {"chosen_option": 4}),
        ("/api/quiz/today/answer", {"extra": "field"}),
    ],
)
async def test_tg60_c9_invalid_data_is_a_422(
    client: AsyncClient, path: str, changes: dict[str, Any]
) -> None:
    headers = await login(client)

    if path.endswith("/answer"):
        response = await answer(client, headers, **changes)
    else:
        response = await client.get(path, headers=headers)

    assert_problem(response, 422, "VALIDATION_ERROR")


async def test_tg60_c11_the_question_of_the_day_is_cached_in_redis(
    client: AsyncClient, redis: Redis
) -> None:
    headers = await login(client)

    await client.get("/api/quiz/today?lang=ca", headers=headers)

    key = f"cache:quiz:daily:{TODAY}:ca"
    assert await redis.exists(key)
    assert 0 < await redis.ttl(key) <= 14 * 60 * 60


async def test_tg60_c2_a_day_keeps_its_question_when_the_bank_grows(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login(client)
    cached = (await client.get("/api/quiz/today?lang=ca", headers=headers)).json()
    await connection.execute(
        text(
            "INSERT INTO quiz_questions (id, position, correct_option, source_url)"
            " VALUES (:id, 100, 0, 'https://science.nasa.gov/')"
        ),
        {"id": EXTRA_ID},
    )

    # English was not cached yet: it is read from PostgreSQL with 101 questions.
    fresh = (await client.get("/api/quiz/today?lang=en", headers=headers)).json()
    response = await answer(client, headers)

    assert fresh["question_id"] == cached["question_id"]
    assert response.status_code == 201


@pytest.fixture
async def committed() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Sessions that really commit, for the migration test that needs it.

    It removes only what the test creates: its users (with their answers) and
    the day of NOW in the calendar if it was not there before.
    """
    engine = create_async_engine(DatabaseSettings().database_url)
    async with engine.connect() as connection:
        day_existed = await connection.scalar(DAY_EXISTS, {"day": NOW.date()})
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        async with engine.begin() as connection:
            for statement in CLEAN_ROLLBACK_USERS:
                await connection.execute(statement, {"prefix": f"{ROLLBACK_PREFIX}-%"})
            if not day_existed:
                await connection.execute(DELETE_DAY, {"day": NOW.date()})
        await engine.dispose()


async def test_tg60_c13_a_rollback_of_the_bank_keeps_answers_and_cached_ids(
    google_certs: respx.Route,
    committed: async_sessionmaker[AsyncSession],
    redis: Redis,
) -> None:
    async with serve(committed, redis) as client:
        answered_headers = await login(client, ROLLBACK_PREFIX)
        answered = (await answer(client, answered_headers)).json()
        other = await login(client, ROLLBACK_PREFIX)
        cached = (await client.get("/api/quiz/today", headers=other)).json()

        # Alembic runs its own event loop, so it goes to another thread.
        await asyncio.to_thread(command.downgrade, _alembic_config(), "4f2c9a1b7d3e")
        async with committed() as session:
            kept = await session.scalar(
                COUNT_ANSWERS, {"prefix": f"{ROLLBACK_PREFIX}-%"}
            )
        await asyncio.to_thread(command.upgrade, _alembic_config(), "head")
        async with committed() as session:
            bank = await session.scalar(text("SELECT count(*) FROM quiz_questions"))

        # Redis still holds the question of the day with its id: it must work.
        response = await client.post(
            "/api/quiz/today/answer",
            headers=other,
            json={
                "date": TODAY,
                "question_id": cached["question_id"],
                "chosen_option": 0,
            },
        )
        today = (await client.get("/api/quiz/today", headers=answered_headers)).json()

    assert kept == 1
    assert bank == 100
    assert response.status_code == 201
    assert today["result"] == answered


async def test_tg60_c12_with_redis_down_the_quiz_fails_safely_with_a_503(
    client: AsyncClient, factory: async_sessionmaker[AsyncSession]
) -> None:
    # Decision of the team (contracte-quiz.md): the cache falls back to
    # PostgreSQL, but the session cannot be checked without Redis and ADR-0008
    # asks to fail safely, so the endpoint answers 503 SESSION_UNAVAILABLE.
    headers = await login(client)
    down = Redis.from_url(DOWN_REDIS_URL, decode_responses=True)
    try:
        async with serve(factory, down) as http:
            responses = [
                await http.get("/api/quiz/today", headers=headers),
                await http.post(
                    "/api/quiz/today/answer",
                    headers=headers,
                    json={
                        "date": TODAY,
                        "question_id": str(uuid.UUID(int=1)),
                        "chosen_option": 0,
                    },
                ),
            ]
    finally:
        await down.aclose()

    for response in responses:
        assert_problem(response, 503, SESSION_UNAVAILABLE)
