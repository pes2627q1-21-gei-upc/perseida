"""CORS for the browser clients (Expo web app and admin panel).

Only explicitly listed origins (plus an optional regex) are allowed, never ``*``:
the API sends credentials (``Authorization``), and a wildcard with credentials would
let any site call it on the user's behalf. The middleware must be the innermost one
so preflight answers still carry the correlation id and the security headers.
"""

from typing import Annotated

from fastapi import FastAPI
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from starlette.middleware.cors import CORSMiddleware

from app.infrastructure.api.correlation import CORRELATION_HEADER

DEFAULT_ALLOWED_ORIGINS = (
    "https://perseida.duckdns.org:40431",
    "http://perseida.duckdns.org:40430",
    "https://perseida.duckdns.org",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "http://localhost:8000",
)
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
ALLOWED_HEADERS = ["Authorization", "Content-Type"]


class CorsSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Comma-separated list of exact origins (scheme://host[:port]).
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_ORIGINS)
    )
    cors_allowed_origin_regex: str | None = None

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


def add_cors(app: FastAPI, settings: CorsSettings | None = None) -> None:
    """Install the CORS middleware with the configured origins."""
    cors = settings if settings is not None else CorsSettings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors.cors_allowed_origins,
        allow_origin_regex=cors.cors_allowed_origin_regex,
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
        expose_headers=[CORRELATION_HEADER],
    )
