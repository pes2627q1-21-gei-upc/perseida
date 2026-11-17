"""Event posts API: POST/GET /api/events/{id}/posts, PATCH/DELETE /api/posts/{id}.

TG-633 (US TG-628). Services wired with in-memory fakes; the real auth flow.
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
from app.application.posts.post_service import PostService
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.domain.posts.errors import (
    POST_FORBIDDEN,
    POST_NOT_FOUND,
    POST_TEXT_EMPTY,
    POST_TEXT_TOO_LONG,
)
from app.domain.posts.models import Post, PostAuthor
from app.domain.users.models import User
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.posts.dependencies import get_post_service
from app.infrastructure.posts.router import router
from app.infrastructure.users.dependencies import get_user_service
from tests.factories.events import make_event
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.events import FakeEventRepository
from tests.fakes.posts import FakePostRepository
from tests.fakes.users import InMemoryUserRepository

PROBLEM_JSON = "application/problem+json"
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
NOW = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)

ME = User.create(google_sub="google-123", email="ana@example.com", display_name="Ana")
OTHER = User.create(
    google_sub="google-999", email="bob@example.com", display_name="Bob"
)
EVENT = make_event(NOW)
UNKNOWN_ID = uuid.UUID("01a1bd9a-ffff-7000-8000-000000000000")


def _post(author: User, text: str = "Hola", minutes: int = 0) -> Post:
    return Post.create(
        event_id=EVENT.id,
        author=PostAuthor(id=author.id, name=author.display_name or author.email),
        text=text,
        now=NOW + timedelta(minutes=minutes),
    )


async def _client(
    posts: FakePostRepository,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    auth = AuthService(
        FakeGoogleTokenVerifier(IDENTITY),
        FakeTokenCodec(),
        InMemorySessionStore(),
        FakeAccountGateway(),
        DURATIONS,
    )
    app = FastAPI()
    app.include_router(router, prefix="/api")
    register_error_handlers(app)
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_user_service] = lambda: UserService(
        InMemoryUserRepository(ME, OTHER)
    )
    app.dependency_overrides[get_post_service] = lambda: PostService(
        posts, FakeEventRepository([EVENT])
    )
    tokens = await auth.login("google-id-token")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, {"Authorization": f"Bearer {tokens.access_token}"}


def _assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", f"/api/events/{EVENT.id}/posts", {"text": "Hola"}),
        ("GET", f"/api/events/{EVENT.id}/posts", None),
        ("PATCH", f"/api/posts/{UNKNOWN_ID}", {"text": "Hola"}),
        ("DELETE", f"/api/posts/{UNKNOWN_ID}", None),
    ],
)
@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer forged"}, id="forged-token"),
    ],
)
async def test_post_endpoints_without_a_valid_session_are_401(
    method: str, path: str, body: dict[str, str] | None, headers: dict[str, str]
) -> None:
    # TG-628 criteri 5: tots els endpoints requereixen sessio
    repo = FakePostRepository()
    async for client, _ in _client(repo):
        response = await client.request(method, path, json=body, headers=headers)

    _assert_problem(response, 401, INVALID_SESSION)
    assert repo.posts == {}


async def test_create_post_returns_201_with_the_trimmed_post_of_the_session_user() -> (
    None
):
    # TG-628 criteri 1: crea la publicacio de la usuaria autenticada
    repo = FakePostRepository()
    async for client, auth in _client(repo):
        response = await client.post(
            f"/api/events/{EVENT.id}/posts",
            json={"text": "  Es veu Júpiter  "},
            headers=auth,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["text"] == "Es veu Júpiter"
    assert body["author"] == {"id": str(ME.id), "name": "Ana"}
    assert body["edited_at"] is None
    assert set(body) == {"id", "author", "text", "created_at", "edited_at"}
    assert [str(p.id) for p in repo.posts.values()] == [body["id"]]


async def test_create_post_on_an_unknown_event_is_404() -> None:
    # TG-628 criteri 1: esdeveniment inexistent
    repo = FakePostRepository()
    async for client, auth in _client(repo):
        response = await client.post(
            f"/api/events/{UNKNOWN_ID}/posts", json={"text": "Hola"}, headers=auth
        )

    _assert_problem(response, 404, "EVENT_NOT_FOUND")
    assert repo.posts == {}


@pytest.mark.parametrize(
    ("text", "code"),
    [("   ", POST_TEXT_EMPTY), ("a" * 1001, POST_TEXT_TOO_LONG)],
)
async def test_create_post_with_invalid_text_is_422(text: str, code: str) -> None:
    # TG-628 criteri 1: text invalid
    repo = FakePostRepository()
    async for client, auth in _client(repo):
        response = await client.post(
            f"/api/events/{EVENT.id}/posts", json={"text": text}, headers=auth
        )

    _assert_problem(response, 422, code)
    assert repo.posts == {}


@pytest.mark.parametrize("body", [{}, {"text": 3}, {"text": "a", "extra": 1}])
async def test_create_post_with_a_malformed_body_is_422(
    body: dict[str, object],
) -> None:
    # TG-628 criteri 1: cos mal format (RFC 9457)
    async for client, auth in _client(FakePostRepository()):
        response = await client.post(
            f"/api/events/{EVENT.id}/posts", json=body, headers=auth
        )

    _assert_problem(response, 422, "VALIDATION_ERROR")


async def test_list_posts_is_newest_first_and_paginated_by_cursor() -> None:
    # TG-628 criteri 2: ordre invers i paginacio per cursor
    oldest, middle, newest = (_post(ME, f"p{i}", minutes=i) for i in range(3))
    repo = FakePostRepository([oldest, middle, newest])
    async for client, auth in _client(repo):
        first = await client.get(
            f"/api/events/{EVENT.id}/posts", params={"limit": 2}, headers=auth
        )
        cursor = first.json()["next_cursor"]
        second = await client.get(
            f"/api/events/{EVENT.id}/posts",
            params={"limit": 2, "cursor": cursor},
            headers=auth,
        )

    assert first.status_code == 200
    assert [p["text"] for p in first.json()["items"]] == ["p2", "p1"]
    assert cursor is not None
    assert [p["text"] for p in second.json()["items"]] == ["p0"]
    assert second.json()["next_cursor"] is None


async def test_list_posts_returns_the_contract_fields() -> None:
    # TG-628 criteri 2: id, autor (id i nom), text, created_at i edited_at
    post = _post(OTHER, "Cel net")
    async for client, auth in _client(FakePostRepository([post])):
        response = await client.get(f"/api/events/{EVENT.id}/posts", headers=auth)

    assert response.json()["items"] == [
        {
            "id": str(post.id),
            "author": {"id": str(OTHER.id), "name": "Bob"},
            "text": "Cel net",
            "created_at": "2026-11-17T10:00:00Z",
            "edited_at": None,
        }
    ]


async def test_list_posts_of_an_unknown_event_is_404() -> None:
    # TG-628 criteri 2: esdeveniment inexistent
    async for client, auth in _client(FakePostRepository()):
        response = await client.get(f"/api/events/{UNKNOWN_ID}/posts", headers=auth)

    _assert_problem(response, 404, "EVENT_NOT_FOUND")


async def test_list_posts_with_an_invalid_cursor_is_422() -> None:
    # TG-628 criteri 2: cursor opac invalid
    async for client, auth in _client(FakePostRepository()):
        response = await client.get(
            f"/api/events/{EVENT.id}/posts",
            params={"cursor": "not-a-cursor"},
            headers=auth,
        )

    _assert_problem(response, 422, "INVALID_CURSOR")


@pytest.mark.parametrize("limit", [0, 51])
async def test_list_posts_with_a_limit_out_of_range_is_422(limit: int) -> None:
    # TG-628 criteri 2: limit acotat (1-50)
    async for client, auth in _client(FakePostRepository()):
        response = await client.get(
            f"/api/events/{EVENT.id}/posts", params={"limit": limit}, headers=auth
        )

    _assert_problem(response, 422, "VALIDATION_ERROR")


async def test_patch_own_post_updates_text_and_edited_at() -> None:
    # TG-628 criteri 3: l'autora edita el text i es desa edited_at
    post = _post(ME, "Abans")
    repo = FakePostRepository([post])
    async for client, auth in _client(repo):
        response = await client.patch(
            f"/api/posts/{post.id}", json={"text": " Després "}, headers=auth
        )

    assert response.status_code == 200
    assert response.json()["text"] == "Després"
    assert response.json()["edited_at"] is not None
    assert repo.posts[post.id].text == "Després"


async def test_patch_a_post_of_another_user_is_403() -> None:
    # TG-628 criteri 3: nomes l'autora
    post = _post(OTHER, "De Bob")
    repo = FakePostRepository([post])
    async for client, auth in _client(repo):
        response = await client.patch(
            f"/api/posts/{post.id}", json={"text": "Hackejat"}, headers=auth
        )

    _assert_problem(response, 403, POST_FORBIDDEN)
    assert repo.posts[post.id] == post


async def test_patch_an_unknown_post_is_404() -> None:
    # TG-628 criteri 3: no existeix
    async for client, auth in _client(FakePostRepository()):
        response = await client.patch(
            f"/api/posts/{UNKNOWN_ID}", json={"text": "Hola"}, headers=auth
        )

    _assert_problem(response, 404, POST_NOT_FOUND)


async def test_patch_with_invalid_text_is_422() -> None:
    # TG-628 criteri 3: el text editat segueix les mateixes regles
    post = _post(ME)
    repo = FakePostRepository([post])
    async for client, auth in _client(repo):
        response = await client.patch(
            f"/api/posts/{post.id}", json={"text": " "}, headers=auth
        )

    _assert_problem(response, 422, POST_TEXT_EMPTY)
    assert repo.posts[post.id] == post


async def test_delete_own_post_is_204() -> None:
    # TG-628 criteri 4: l'autora l'esborra
    post = _post(ME)
    repo = FakePostRepository([post])
    async for client, auth in _client(repo):
        response = await client.delete(f"/api/posts/{post.id}", headers=auth)

    assert response.status_code == 204
    assert response.content == b""
    assert repo.posts == {}


async def test_delete_a_post_of_another_user_is_403() -> None:
    # TG-628 criteri 4: nomes l'autora
    post = _post(OTHER)
    repo = FakePostRepository([post])
    async for client, auth in _client(repo):
        response = await client.delete(f"/api/posts/{post.id}", headers=auth)

    _assert_problem(response, 403, POST_FORBIDDEN)
    assert post.id in repo.posts


async def test_delete_an_unknown_post_is_404() -> None:
    # TG-628 criteri 4: no existeix
    async for client, auth in _client(FakePostRepository()):
        response = await client.delete(f"/api/posts/{UNKNOWN_ID}", headers=auth)

    _assert_problem(response, 404, POST_NOT_FOUND)


async def test_post_text_is_returned_verbatim_as_json_text() -> None:
    # TG-628 criteri 6: el text es tracta com a text, mai com a HTML (ADR-0024)
    html = '<script>alert(1)</script><a href="javascript:x">x</a>'
    repo = FakePostRepository()
    async for client, auth in _client(repo):
        response = await client.post(
            f"/api/events/{EVENT.id}/posts", json={"text": html}, headers=auth
        )

    assert response.status_code == 201
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["text"] == html
