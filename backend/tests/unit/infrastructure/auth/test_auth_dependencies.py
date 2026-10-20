from typing import Any, cast

from fastapi import FastAPI
from starlette.requests import HTTPConnection

from app.domain.auth.models import AccountStatus, GoogleIdentity
from app.infrastructure.auth.dependencies import get_auth_service
from app.infrastructure.auth.provisional_account_gateway import (
    ProvisionalAccountGateway,
)


async def test_the_provisional_gateway_accepts_every_account() -> None:
    identity = GoogleIdentity(google_sub="google-123", email="ana@example.com")

    status = await ProvisionalAccountGateway().get_status(identity)

    assert status is AccountStatus.ACTIVE


def test_get_auth_service_returns_the_service_built_in_the_lifespan() -> None:
    app = FastAPI()
    service = object()
    app.state.auth_service = service
    conn = cast(Any, type("Conn", (), {"app": app})())

    assert get_auth_service(cast(HTTPConnection, conn)) is service
