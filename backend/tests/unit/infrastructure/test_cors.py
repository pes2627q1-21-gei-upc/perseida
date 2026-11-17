"""CORS: allowed and rejected origins, preflight and middleware order (TG-363)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.infrastructure.api.cors import CorsSettings, add_cors
from app.infrastructure.auth.dependencies import get_auth_service
from app.main import create_app

PUBLIC_ORIGINS = [
    "https://perseida.duckdns.org:40431",
    "https://perseida.duckdns.org",
]
LOCAL_ORIGINS = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "http://localhost:8000",
]
REJECTED_ORIGINS = [
    "https://malicious.com",
    "http://192.168.1.10:8081",
    "https://evil.perseida.duckdns.org",
    # Production over plain HTTP: Force SSL redirects it to HTTPS, so no page is
    # ever served from it, and a page tampered with on the network could call the
    # API with the user's session.
    "http://perseida.duckdns.org:40430",
]
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
ACAO = "access-control-allow-origin"


@pytest.fixture(autouse=True)
def _no_cors_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("CORS_ALLOWED_ORIGIN_REGEX", raising=False)
    # create_app() builds CorsSettings() with env_file=".env": run from an empty
    # directory so a developer's backend/.env does not change the expected origins.
    monkeypatch.chdir(tmp_path)
    yield


def _app(settings: CorsSettings | None = None) -> FastAPI:
    app = FastAPI()
    add_cors(app, settings or CorsSettings(_env_file=None))

    @app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {"ok": "yes"}

    return app


def _real_app() -> FastAPI:
    # ASGITransport does not run the lifespan, so no PostgreSQL/Redis is needed.
    app = create_app()
    app.dependency_overrides[get_auth_service] = lambda: object()
    return app


async def _get(app: FastAPI, origin: str, path: str = "/api/ping") -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.get(path, headers={"Origin": origin})


async def _preflight(
    app: FastAPI, origin: str, path: str = "/api/ping", method: str = "POST"
) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.options(
            path,
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )


def test_tg363_c1_defaults_are_the_known_origins_and_no_regex() -> None:
    settings = CorsSettings(_env_file=None)

    assert settings.cors_allowed_origins == PUBLIC_ORIGINS + LOCAL_ORIGINS
    assert settings.cors_allowed_origin_regex is None
    assert "*" not in settings.cors_allowed_origins


def test_tg363_c1_origins_and_regex_come_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS", "https://a.example, https://b.example:8443"
    )
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN_REGEX", r"https://.*\.preview\.example")

    settings = CorsSettings(_env_file=None)

    assert settings.cors_allowed_origins == [
        "https://a.example",
        "https://b.example:8443",
    ]
    assert settings.cors_allowed_origin_regex == r"https://.*\.preview\.example"


@pytest.mark.parametrize("origin", PUBLIC_ORIGINS + LOCAL_ORIGINS)
async def test_tg363_c2_c3_allowed_origins_are_echoed_on_requests_and_preflights(
    origin: str,
) -> None:
    app = _app()

    simple = await _get(app, origin)
    preflight = await _preflight(app, origin)

    assert simple.headers[ACAO] == origin
    assert preflight.status_code == 200
    assert preflight.headers[ACAO] == origin


@pytest.mark.parametrize("origin", REJECTED_ORIGINS)
async def test_tg363_c4_other_origins_get_no_cors_headers(origin: str) -> None:
    app = _app()

    simple = await _get(app, origin)
    preflight = await _preflight(app, origin)

    assert ACAO not in simple.headers
    assert ACAO not in preflight.headers


async def test_tg363_c5_preflight_allows_credentials_methods_and_headers() -> None:
    response = await _preflight(_app(), PUBLIC_ORIGINS[0])

    assert response.headers["access-control-allow-credentials"] == "true"
    methods = response.headers["access-control-allow-methods"].split(",")
    assert {method.strip() for method in methods} == METHODS
    headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in headers
    assert "content-type" in headers


async def test_tg363_c6_correlation_id_is_exposed_to_the_browser() -> None:
    response = await _get(_app(), PUBLIC_ORIGINS[0])

    assert response.headers["access-control-allow-credentials"] == "true"
    exposed = response.headers["access-control-expose-headers"].lower()
    assert "x-correlation-id" in exposed


async def test_tg363_env_origins_replace_the_defaults_and_regex_adds_more(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://a.example")
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN_REGEX", r"https://.*\.preview\.example")
    app = _app(CorsSettings(_env_file=None))

    listed = await _get(app, "https://a.example")
    matched = await _get(app, "https://pr-12.preview.example")
    default = await _get(app, LOCAL_ORIGINS[0])

    assert listed.headers[ACAO] == "https://a.example"
    assert matched.headers[ACAO] == "https://pr-12.preview.example"
    assert ACAO not in default.headers


async def test_tg363_c7_real_app_answers_preflight_before_the_routers() -> None:
    # /api/health only has GET: without CORS in front the router would say 405.
    response = await _preflight(_real_app(), PUBLIC_ORIGINS[0], "/api/health", "GET")

    assert response.status_code == 200
    assert response.headers[ACAO] == PUBLIC_ORIGINS[0]
    assert response.headers["x-correlation-id"]
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_tg363_c4_c6_real_app_wires_the_defaults() -> None:
    app = _real_app()

    allowed = await _get(app, PUBLIC_ORIGINS[0], "/api/nope")
    rejected = await _get(app, REJECTED_ORIGINS[0], "/api/nope")

    exposed = allowed.headers["access-control-expose-headers"].lower()
    assert allowed.headers[ACAO] == PUBLIC_ORIGINS[0]
    assert "x-correlation-id" in exposed
    assert allowed.headers["x-correlation-id"]
    assert ACAO not in rejected.headers
