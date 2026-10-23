from typing import Any, cast

from fastapi import FastAPI
from starlette.requests import HTTPConnection

from app.infrastructure.auth.dependencies import get_auth_service


def test_get_auth_service_returns_the_service_built_in_the_lifespan() -> None:
    app = FastAPI()
    service = object()
    app.state.auth_service = service
    conn = cast(Any, type("Conn", (), {"app": app})())

    assert get_auth_service(cast(HTTPConnection, conn)) is service
