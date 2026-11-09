"""Daily quiz API with PostgreSQL and Redis for real (TG-60).

Only Google is simulated (respx + a throwaway RSA key). The clock of the quiz
service is fixed so that "today" is known.
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
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
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
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.quiz.dependencies import get_quiz_service
from app.infrastructure.quiz.repository import (
    SqlQuizAnswerRepository,
    SqlQuizQuestionRepository,
)
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

PROBLEM_JSON = "application/problem+json"
NOW = datetime(2026, 11, 9, 10, 0, tzinfo=UTC)
TODAY = NOW.date().isoformat()
SOLUTION_FIELDS = {"correct_option", "explanation", "source_url"}


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
def google_certs() -> Iterator[respx.Route]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM quiz_answers"))
            await connection.execute(text("DELETE FROM user_identities"))
            await connection.execute(text("DELETE FROM users"))
        await engine.dispose()


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
    try:
        async for key in client.scan_iter(match="cache:quiz:*"):
            await client.delete(key)
        yield client
    finally:
        async for key in client.scan_iter(match="cache:quiz:*"):
            await client.delete(key)
        await client.aclose()


@pytest.fixture
async def client(
    google_certs: respx.Route, engine: AsyncEngine, redis: Redis
) -> AsyncIterator[AsyncClient]:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    users = build_user_service(factory)
    quiz = QuizService(
        SqlQuizQuestionRepository(factory),
        SqlQuizAnswerRepository(factory),
        RedisCache(redis, 3600),
        now=lambda: NOW,
    )
    async with httpx.AsyncClient() as google:
        app: FastAPI = create_app()
        app.state.user_service = users
        app.state.auth_service = AuthService(
            GoogleJwksVerifier(google, [CLIENT_ID]),
            JwtTokenCodec("q" * 40),
            RedisSessionStore(redis),
            UserAccountGateway(users),
            SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
        )
        app.dependency_overrides[get_quiz_service] = lambda: quiz
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http


async def login(client: AsyncClient, **body: Any) -> dict[str, str]:
    sub = f"quiz-{uuid.uuid4().hex}"
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
