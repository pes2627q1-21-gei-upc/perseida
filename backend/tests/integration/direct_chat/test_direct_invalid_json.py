"""TG-65: malformed body is reported and documented as problem details."""

import os

import pytest
from httpx import AsyncClient

from tests.integration.chat.test_chat_api import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.chat.test_chat_api import _schema_at_head as _schema_at_head
from tests.integration.chat.test_chat_api import app as app
from tests.integration.chat.test_chat_api import client as client
from tests.integration.chat.test_chat_api import connection as connection
from tests.integration.chat.test_chat_api import factory as factory
from tests.integration.chat.test_chat_api import google_certs as google_certs
from tests.integration.chat.test_chat_api import login_headers

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)


async def test_tg65_invalid_json_encoding_returns_documented_problem(
    client: AsyncClient,
) -> None:
    headers = await login_headers(client)
    response = await client.post(
        "/api/direct-conversations",
        headers={**headers, "Content-Type": "application/json"},
        content=b"\xff",
    )
    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "HTTP_400"

    schema = (await client.get("/api/openapi.json")).json()
    documented = schema["paths"]["/api/direct-conversations"]["post"]["responses"]
    assert "application/problem+json" in documented["400"]["content"]
