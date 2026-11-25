"""Outings API with PostgreSQL and Redis for real (TG-629, task #639).

Only Google is simulated (respx + a throwaway RSA key); the app is wired as the
lifespan does it, with the real session store, user repository and tables.
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
from app.domain.outings.errors import (
    OUTING_DESCRIPTION_TOO_LONG,
    OUTING_ENDS_BEFORE_START,
    OUTING_EVENT_NOT_FOUND,
    OUTING_FORBIDDEN,
    OUTING_NOT_FOUND,
    OUTING_PLACE_INVALID,
    OUTING_STARTS_IN_PAST,
    OUTING_TITLE_EMPTY,
    OUTING_TITLE_TOO_LONG,
)
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
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
OUTINGS = "/api/outings"


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


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
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
    return async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )


@pytest.fixture
async def client(
    google_certs: respx.Route,
    factory: async_sessionmaker[AsyncSession],
    redis: Redis,
) -> AsyncIterator[AsyncClient]:
    users = build_user_service(factory)
    async with httpx.AsyncClient() as google:
        app: FastAPI = create_app()
        app.state.session_factory = factory
        app.state.user_service = users
        # The events endpoints (criterion 5) read the cache; no source is called.
        app.state.event_sources = []
        app.state.redis = redis
        app.state.cache_default_ttl_seconds = 60
        app.state.auth_service = AuthService(
            GoogleJwksVerifier(google, [CLIENT_ID]),
            JwtTokenCodec("i" * 40),
            RedisSessionStore(redis, RedisPubSub(redis)),
            UserAccountGateway(users),
            SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http


async def login_headers(client: AsyncClient, name: str = "Anna") -> dict[str, str]:
    sub = f"it-outings-{uuid.uuid4().hex}"
    id_token = token(sub=sub, email=f"{sub}@example.test", name=name)
    response = await client.post("/api/auth/google", json={"id_token": id_token})
    tokens: dict[str, Any] = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


def _iso(moment: datetime) -> str:
    return moment.isoformat()


def body(**overrides: Any) -> dict[str, Any]:
    start = datetime.now(UTC) + timedelta(days=1)
    payload: dict[str, Any] = {
        "title": "Perseides al Montsec",
        "description": "Portem termos.",
        "starts_at": _iso(start),
        "ends_at": _iso(start + timedelta(hours=3)),
        "location": {"latitude": 42.0517, "longitude": 0.7296},
        "event_id": None,
    }
    payload.update(overrides)
    return payload


async def _event_id(connection: AsyncConnection) -> str:
    now = datetime.now(UTC)
    result = await connection.execute(
        text(
            "INSERT INTO astronomical_events"
            " (source, external_id, title, summary, category, starts_at, ends_at)"
            " VALUES ('catalog', :external_id, 'Perseides', 'Pluja', 'meteor_shower',"
            " :starts_at, :ends_at) RETURNING id"
        ),
        {
            "external_id": f"it-outings-{uuid.uuid4().hex}",
            "starts_at": now,
            "ends_at": now + timedelta(days=3),
        },
    )
    return str(result.scalar_one())


async def _create(
    client: AsyncClient, headers: dict[str, str], **overrides: Any
) -> Any:
    response = await client.post(OUTINGS, json=body(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


# --- 401 ------------------------------------------------------------------------

ANY_ID = str(uuid.uuid7())


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", OUTINGS),
        ("GET", OUTINGS),
        ("GET", f"{OUTINGS}/{ANY_ID}"),
        ("PATCH", f"{OUTINGS}/{ANY_ID}"),
        ("DELETE", f"{OUTINGS}/{ANY_ID}"),
    ],
    # ANY_ID changes on every import: the ids must not depend on it (xdist).
    ids=["create", "list", "get", "patch", "delete"],
)
async def test_every_endpoint_requires_a_session(
    client: AsyncClient, method: str, path: str
) -> None:
    # TG-629 criteri 4: 401 sense sessió vàlida
    response = await client.request(method, path, json=body())

    assert_problem(response, 401, INVALID_SESSION)


# --- create ---------------------------------------------------------------------


async def test_create_returns_201_with_the_outing_and_its_author(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-629 criteri 1
    headers = await login_headers(client, "Anna")
    event_id = await _event_id(connection)

    response = await client.post(OUTINGS, json=body(event_id=event_id), headers=headers)

    assert response.status_code == 201
    created = response.json()
    assert uuid.UUID(created["id"]).version == 7
    assert created["title"] == "Perseides al Montsec"
    assert created["description"] == "Portem termos."
    assert created["location"] == {"latitude": 42.0517, "longitude": 0.7296}
    assert created["event_id"] == event_id
    assert created["author"]["display_name"] == "Anna"
    assert set(created["author"]) == {"id", "display_name", "avatar_url"}
    assert response.headers["location"] == f"{OUTINGS}/{created['id']}"


async def test_create_without_description_nor_event(client: AsyncClient) -> None:
    headers = await login_headers(client)
    payload = body()
    del payload["description"]
    del payload["event_id"]

    response = await client.post(OUTINGS, json=payload, headers=headers)

    assert response.status_code == 201
    assert response.json()["description"] == ""
    assert response.json()["event_id"] is None


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"title": "   "}, OUTING_TITLE_EMPTY),
        (
            {
                "starts_at": _iso(datetime.now(UTC) + timedelta(days=2)),
                "ends_at": _iso(datetime.now(UTC) + timedelta(days=1)),
            },
            OUTING_ENDS_BEFORE_START,
        ),
        (
            {
                "starts_at": _iso(datetime.now(UTC) - timedelta(hours=1)),
                "ends_at": _iso(datetime.now(UTC) + timedelta(hours=1)),
            },
            OUTING_STARTS_IN_PAST,
        ),
        ({"event_id": str(uuid.uuid7())}, OUTING_EVENT_NOT_FOUND),
        # Decisió de Raquel (17/11/2026): la longitud la mira el domini, amb el codi
        ({"title": "a" * 121}, OUTING_TITLE_TOO_LONG),
        ({"description": "a" * 2001}, OUTING_DESCRIPTION_TOO_LONG),
    ],
)
async def test_create_with_invalid_data_is_422(
    client: AsyncClient, overrides: dict[str, Any], code: str
) -> None:
    # TG-629 criteri 1: 422 RFC 9457 amb un codi estable
    headers = await login_headers(client)

    response = await client.post(OUTINGS, json=body(**overrides), headers=headers)

    assert_problem(response, 422, code)


@pytest.mark.parametrize(
    "overrides",
    [
        {"location": {"latitude": 91, "longitude": 0}},
        {"location": {"latitude": 0, "longitude": -181}},
        {"location": None},
        {"starts_at": "2026-12-01T22:00:00"},
        {"starts_at": "not a date"},
    ],
)
async def test_create_with_a_malformed_body_is_422(
    client: AsyncClient, overrides: dict[str, Any]
) -> None:
    headers = await login_headers(client)

    response = await client.post(OUTINGS, json=body(**overrides), headers=headers)

    assert response.status_code == 422
    assert response.headers["content-type"].startswith(PROBLEM_JSON)


async def test_the_length_is_measured_after_cleaning(client: AsyncClient) -> None:
    # 120 caràcters útils amb blancs als extrems: el domini els treu abans de mesurar
    headers = await login_headers(client)

    response = await client.post(
        OUTINGS, json=body(title=f"   {'a' * 120}   "), headers=headers
    )

    assert response.status_code == 201
    assert response.json()["title"] == "a" * 120


# --- list and get ---------------------------------------------------------------


async def test_list_filters_by_event_and_by_mine(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-629 criteri 2 i decisió de Raquel (?mine=true)
    anna = await login_headers(client, "Anna")
    biel = await login_headers(client, "Biel")
    event_id = await _event_id(connection)
    soon = datetime.now(UTC) + timedelta(hours=2)
    linked = await _create(
        client,
        anna,
        event_id=event_id,
        starts_at=_iso(soon + timedelta(hours=1)),
        ends_at=_iso(soon + timedelta(hours=2)),
    )
    of_biel = await _create(
        client, biel, starts_at=_iso(soon), ends_at=_iso(soon + timedelta(hours=1))
    )

    everything = await client.get(OUTINGS, headers=anna)
    by_event = await client.get(OUTINGS, params={"event_id": event_id}, headers=anna)
    mine = await client.get(OUTINGS, params={"mine": "true"}, headers=biel)

    ids = [outing["id"] for outing in everything.json()]
    assert ids.index(of_biel["id"]) < ids.index(linked["id"])
    assert [outing["id"] for outing in by_event.json()] == [linked["id"]]
    assert [outing["id"] for outing in mine.json()] == [of_biel["id"]]


async def test_get_returns_the_detail_with_the_author(client: AsyncClient) -> None:
    # TG-629 criteri 2
    anna = await login_headers(client, "Anna")
    biel = await login_headers(client, "Biel")
    created = await _create(client, anna)

    response = await client.get(f"{OUTINGS}/{created['id']}", headers=biel)

    assert response.status_code == 200
    assert response.json() == created


async def test_get_of_an_unknown_outing_is_404(client: AsyncClient) -> None:
    headers = await login_headers(client)

    response = await client.get(f"{OUTINGS}/{uuid.uuid7()}", headers=headers)

    assert_problem(response, 404, OUTING_NOT_FOUND)


async def test_get_with_a_malformed_id_is_422(client: AsyncClient) -> None:
    headers = await login_headers(client)

    response = await client.get(f"{OUTINGS}/not-a-uuid", headers=headers)

    assert response.status_code == 422


# --- update and delete ----------------------------------------------------------


async def test_the_author_can_patch_her_outing(client: AsyncClient) -> None:
    # TG-629 criteri 3
    anna = await login_headers(client)
    created = await _create(client, anna)

    response = await client.patch(
        f"{OUTINGS}/{created['id']}", json={"title": "Nou títol"}, headers=anna
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Nou títol"
    assert response.json()["description"] == created["description"]


async def test_patch_with_a_null_title_is_422(client: AsyncClient) -> None:
    anna = await login_headers(client)
    created = await _create(client, anna)

    response = await client.patch(
        f"{OUTINGS}/{created['id']}", json={"title": None}, headers=anna
    )

    assert response.status_code == 422


async def test_patch_can_unlink_the_event(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    anna = await login_headers(client)
    created = await _create(client, anna, event_id=await _event_id(connection))

    response = await client.patch(
        f"{OUTINGS}/{created['id']}", json={"event_id": None}, headers=anna
    )

    assert response.status_code == 200
    assert response.json()["event_id"] is None


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
async def test_someone_else_gets_403(client: AsyncClient, method: str) -> None:
    # TG-629 criteri 3: 403 si no és l'autora
    anna = await login_headers(client, "Anna")
    biel = await login_headers(client, "Biel")
    created = await _create(client, anna)

    response = await client.request(
        method, f"{OUTINGS}/{created['id']}", json={"title": "Meva"}, headers=biel
    )

    assert_problem(response, 403, OUTING_FORBIDDEN)
    still = await client.get(f"{OUTINGS}/{created['id']}", headers=anna)
    assert still.json()["title"] == created["title"]


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
async def test_unknown_outing_gets_404(client: AsyncClient, method: str) -> None:
    # TG-629 criteri 3: 404 si no existeix
    headers = await login_headers(client)

    response = await client.request(
        method, f"{OUTINGS}/{uuid.uuid7()}", json={"title": "Nou"}, headers=headers
    )

    assert_problem(response, 404, OUTING_NOT_FOUND)


async def test_the_author_can_delete_her_outing(client: AsyncClient) -> None:
    # TG-629 criteri 3
    anna = await login_headers(client)
    created = await _create(client, anna)

    response = await client.delete(f"{OUTINGS}/{created['id']}", headers=anna)

    assert response.status_code == 204
    gone = await client.get(f"{OUTINGS}/{created['id']}", headers=anna)
    assert_problem(gone, 404, OUTING_NOT_FOUND)


# --- events ---------------------------------------------------------------------


async def test_outings_do_not_appear_in_the_events_endpoints(
    client: AsyncClient,
) -> None:
    # TG-629 criteri 5: el contracte amb Spotwise (TG-351) no canvia
    headers = await login_headers(client)
    created = await _create(client, headers)

    active = await client.get("/api/events/active")
    upcoming = await client.get("/api/events/upcoming", params={"days": 30})

    listed = [event["id"] for event in active.json() + upcoming.json()]
    assert created["id"] not in listed
    assert all(event["title"] != created["title"] for event in upcoming.json())


# --- place (TG-661) -------------------------------------------------------------

LIBRARY = {
    "name": "Biblioteca Sant Pau - Santa Creu",
    "address": "Carrer del Carme, 47",
}
SAN_ANTONIO = {"latitude": 41.3826, "longitude": 2.166}


async def test_create_without_a_place_answers_a_null_place(
    client: AsyncClient,
) -> None:
    headers = await login_headers(client)

    created = await _create(client, headers)

    assert created["place"] is None


async def test_create_keeps_the_place_and_get_returns_it(client: AsyncClient) -> None:
    headers = await login_headers(client)

    created = await _create(client, headers, place=LIBRARY)
    fetched = await client.get(f"{OUTINGS}/{created['id']}", headers=headers)

    assert created["place"] == LIBRARY
    assert fetched.json()["place"] == LIBRARY


async def test_the_list_shows_the_place(client: AsyncClient) -> None:
    headers = await login_headers(client)
    created = await _create(client, headers, place=LIBRARY)

    response = await client.get(OUTINGS, params={"mine": "true"}, headers=headers)

    shown = [item for item in response.json() if item["id"] == created["id"]]
    assert [item["place"] for item in shown] == [LIBRARY]


async def test_create_with_an_address_left_out_stores_an_empty_one(
    client: AsyncClient,
) -> None:
    headers = await login_headers(client)

    created = await _create(client, headers, place={"name": "Espai d'estudi"})

    assert created["place"] == {"name": "Espai d'estudi", "address": ""}


@pytest.mark.parametrize(
    "place",
    [
        {"name": "   ", "address": "Carrer del Carme, 47"},
        {"name": "n" * 121, "address": ""},
        {"name": "Biblioteca", "address": "a" * 201},
    ],
    ids=["no-name", "name-too-long", "address-too-long"],
)
async def test_create_with_an_invalid_place_is_422(
    client: AsyncClient, place: dict[str, str]
) -> None:
    headers = await login_headers(client)

    response = await client.post(OUTINGS, json=body(place=place), headers=headers)

    assert_problem(response, 422, OUTING_PLACE_INVALID)


async def test_patch_sets_the_place(client: AsyncClient) -> None:
    anna = await login_headers(client)
    created = await _create(client, anna)

    response = await client.patch(
        f"{OUTINGS}/{created['id']}",
        json={"location": SAN_ANTONIO, "place": LIBRARY},
        headers=anna,
    )

    assert response.status_code == 200
    assert response.json()["place"] == LIBRARY
    assert response.json()["location"] == SAN_ANTONIO


async def test_patch_with_a_null_place_clears_it(client: AsyncClient) -> None:
    anna = await login_headers(client)
    created = await _create(client, anna, place=LIBRARY)

    response = await client.patch(
        f"{OUTINGS}/{created['id']}", json={"place": None}, headers=anna
    )

    assert response.status_code == 200
    assert response.json()["place"] is None


async def test_patch_of_other_fields_keeps_the_place(client: AsyncClient) -> None:
    anna = await login_headers(client)
    created = await _create(client, anna, place=LIBRARY)

    response = await client.patch(
        f"{OUTINGS}/{created['id']}", json={"title": "Nou títol"}, headers=anna
    )

    assert response.json()["place"] == LIBRARY


async def test_patch_of_the_location_alone_clears_the_place(
    client: AsyncClient,
) -> None:
    # The name would not match the new coordinates any more.
    anna = await login_headers(client)
    created = await _create(client, anna, place=LIBRARY)

    response = await client.patch(
        f"{OUTINGS}/{created['id']}", json={"location": SAN_ANTONIO}, headers=anna
    )
    fetched = await client.get(f"{OUTINGS}/{created['id']}", headers=anna)

    assert response.json()["place"] is None
    assert fetched.json()["place"] is None
