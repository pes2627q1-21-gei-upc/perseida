"""TG-65: every direct-chat REST endpoint requires an authenticated session.

Draft for the API branch; the shared event-chat fixtures use real PostgreSQL and
Redis, and roll back database changes after each test.
"""

import os
import uuid

import pytest
from httpx import AsyncClient

from app.application.auth.errors import INVALID_SESSION
from tests.integration.chat.test_chat_api import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.chat.test_chat_api import _schema_at_head as _schema_at_head
from tests.integration.chat.test_chat_api import app as app
from tests.integration.chat.test_chat_api import assert_problem
from tests.integration.chat.test_chat_api import client as client
from tests.integration.chat.test_chat_api import connection as connection
from tests.integration.chat.test_chat_api import factory as factory
from tests.integration.chat.test_chat_api import google_certs as google_certs

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

_ID = uuid.UUID("00000000-0000-7000-8000-000000000001")
ENDPOINTS = [
    ("POST", "/api/direct-conversations"),
    ("GET", "/api/direct-conversations"),
    ("GET", f"/api/direct-conversations/{_ID}/messages"),
    ("POST", f"/api/direct-conversations/{_ID}/read"),
    ("PUT", f"/api/users/{_ID}/block"),
    ("DELETE", f"/api/users/{_ID}/block"),
]


@pytest.mark.parametrize(("method", "path"), ENDPOINTS)
@pytest.mark.parametrize("authorization", [None, "Bearer not-a-valid-token"])
async def test_tg65_direct_chat_endpoints_require_a_session(
    client: AsyncClient, method: str, path: str, authorization: str | None
) -> None:
    headers = {"Authorization": authorization} if authorization else {}
    response = await client.request(method, path, headers=headers)
    assert_problem(response, 401, INVALID_SESSION)
