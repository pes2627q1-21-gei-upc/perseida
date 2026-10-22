"""Security headers on every HTTP response (pure ASGI middleware).

The API answers JSON, never HTML, so the default policy forbids everything: if a
response were ever rendered as a page, no script, style, frame or form could run. The
interactive docs (Swagger UI and ReDoc) are the only pages and get a policy that lets
them load their assets from the jsDelivr CDN. Responses that carry or follow
credentials are never cached.
"""

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

API_CSP = (
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
# Swagger UI (FastAPI default) boots from an inline script; assets come from jsDelivr.
DOCS_CSP = (
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.redoc.ly; "
    "worker-src blob:; connect-src 'self'"
)
DOCS_PATHS = ("/api/docs", "/api/redoc")
# One year; browsers only honour HSTS over HTTPS (TLS ends at nginx-proxy-manager).
HSTS = "max-age=31536000; includeSubDomains"
NO_STORE_PREFIXES = ("/api/auth", "/api/users")

STATIC_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]
        request_headers = Headers(scope=scope)
        behind_https = request_headers.get("x-forwarded-proto") == "https"

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in STATIC_HEADERS.items():
                    headers[name] = value
                headers["Content-Security-Policy"] = (
                    DOCS_CSP if path in DOCS_PATHS else API_CSP
                )
                if behind_https:
                    headers["Strict-Transport-Security"] = HSTS
                if path.startswith(NO_STORE_PREFIXES):
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_with_headers)
