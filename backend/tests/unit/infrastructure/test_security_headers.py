import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.infrastructure.api.security_headers import (
    API_CSP,
    DOCS_CSP,
    SecurityHeadersMiddleware,
)
from app.infrastructure.auth.dependencies import get_auth_service
from app.main import create_app


def _real_app() -> FastAPI:
    app = create_app()
    # Requests are refused by validation before the service is ever used.
    app.dependency_overrides[get_auth_service] = lambda: object()
    return app


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/api/auth/ping")
    async def auth_ping() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/api/docs")
    async def docs() -> dict[str, str]:
        return {"ok": "yes"}

    return app


async def _get(path: str, headers: dict[str, str] | None = None) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=_app()), base_url="http://test"
    ) as client:
        return await client.get(path, headers=headers)


async def test_every_response_carries_the_hardening_headers() -> None:
    response = await _get("/api/ping")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cross-origin-opener-policy"] == "same-origin"
    assert "camera=()" in response.headers["permissions-policy"]


async def test_the_api_policy_forbids_everything() -> None:
    response = await _get("/api/ping")

    csp = response.headers["content-security-policy"]
    assert csp == API_CSP
    assert csp.startswith("default-src 'none'")
    assert "frame-ancestors 'none'" in csp
    assert "unsafe" not in csp


async def test_only_the_docs_get_the_policy_that_lets_them_load_their_assets() -> None:
    response = await _get("/api/docs")

    assert response.headers["content-security-policy"] == DOCS_CSP
    assert "https://cdn.jsdelivr.net" in DOCS_CSP
    assert "frame-ancestors 'none'" in DOCS_CSP


async def test_hsts_is_sent_only_behind_https() -> None:
    plain = await _get("/api/ping")
    secure = await _get("/api/ping", {"X-Forwarded-Proto": "https"})

    assert "strict-transport-security" not in plain.headers
    assert secure.headers["strict-transport-security"].startswith("max-age=")


@pytest.mark.parametrize("path", ["/api/auth/ping"])
async def test_credential_endpoints_are_never_cached(path: str) -> None:
    response = await _get(path)

    assert response.headers["cache-control"] == "no-store"


async def test_the_real_app_sends_them_on_errors_too() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=_real_app()), base_url="http://test"
    ) as client:
        not_found = await client.get("/api/nope")
        invalid = await client.post("/api/auth/google", json={})

    for response in (not_found, invalid):
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["content-security-policy"] == API_CSP
    assert invalid.headers["cache-control"] == "no-store"


async def test_oversized_tokens_are_rejected_before_any_work() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=_real_app()), base_url="http://test"
    ) as client:
        login = await client.post("/api/auth/google", json={"id_token": "x" * 4097})
        refresh = await client.post(
            "/api/auth/refresh", json={"refresh_token": "x" * 4097}
        )

    assert login.status_code == 422
    assert refresh.status_code == 422
