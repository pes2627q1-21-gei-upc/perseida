"""Contract fuzzing of the whole API with schemathesis (TG-360, US #360).

The app runs in process (ASGI, with its lifespan) over PostgreSQL and Redis for
real; Google and the NASA are simulated with respx, so nothing leaves the
machine. The seed is fixed: a failure reproduces.
"""

import asyncio
import json
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import asyncpg  # type: ignore[import-untyped]
import pytest
import respx
import schemathesis
from alembic.config import Config
from redis.asyncio import Redis
from schemathesis.config import SchemathesisConfig
from schemathesis.python import asgi

from alembic import command
from app.infrastructure.apod.nasa_client import APOD_URL
from app.infrastructure.apod.nasa_feed_client import FEED_URL
from app.infrastructure.auth.google_verifier import GOOGLE_CERTS_URL
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.scheduler.dependencies import get_scheduler_settings
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token
from tests.integration.problem_check import check_problem_details

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="Contract tests require PostgreSQL and Redis (POSTGRES_HOST, REDIS_HOST)",
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
SEED = 360
MAX_EXAMPLES = 25
# The valid APOD dates (1995-06-16 .. today) cannot be written in OpenAPI: the upper
# bound moves, so the declared 422 for a date outside them is an expected answer.
APOD_EXPECTED_STATUSES = ["2xx", "3xx", "401", "403", "404", "409", "422", "429", "5xx"]


def _migrate() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


async def _clean_state() -> None:
    settings = DatabaseSettings()
    connection = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_db,
    )
    redis = Redis.from_url(RedisSettings().redis_url)
    try:
        await connection.execute("TRUNCATE users, user_identities, apod CASCADE")
        for pattern in ("session:*", "sessions:*", "cache:apod:*"):
            async for key in redis.scan_iter(match=pattern):
                await redis.delete(key)
    finally:
        await connection.close()
        await redis.aclose()


@pytest.fixture(scope="module")
def api_schema() -> Iterator[Any]:
    mp = pytest.MonkeyPatch()
    mp.setenv("SCHEDULER_ENABLED", "false")
    mp.setenv("GOOGLE_CLIENT_IDS", CLIENT_ID)
    mp.setenv("JWT_SECRET", "c" * 32)
    mp.setenv("NASA_API_KEY", "contract-test-key")
    get_scheduler_settings.cache_clear()
    _migrate()
    apod = json.loads((FIXTURES / "nasa_apod_image.json").read_text(encoding="utf-8"))
    with respx.mock(assert_all_called=False) as external:
        external.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})
        external.get(FEED_URL).respond(503)
        external.get(APOD_URL).respond(json=apod)
        config = SchemathesisConfig.from_dict(
            {
                "seed": SEED,
                "generation": {"max-examples": MAX_EXAMPLES, "deterministic": True},
                "operations": [
                    {
                        "include-name": "GET /api/apod",
                        "checks": {
                            "positive_data_acceptance": {
                                "expected-statuses": APOD_EXPECTED_STATUSES
                            }
                        },
                    }
                ],
            }
        )
        app = create_app()
        try:
            yield schemathesis.openapi.from_asgi(
                "/api/openapi.json", app, config=config
            )
        finally:
            asgi.shutdown_lifespans()
            asyncio.run(_clean_state())
            mp.undo()
            get_scheduler_settings.cache_clear()


schema = schemathesis.pytest.from_fixture("api_schema")


@schemathesis.auth()
class SessionAuth:
    """Real login against the app with a throwaway-key Google token."""

    def get(self, case: Any, context: Any) -> str:
        with asgi.get_client(context.app) as client:
            response = client.post(
                "/api/auth/google",
                json={"id_token": token(sub="contract-user", email="c@example.test")},
            )
        access_token: str = response.json()["access_token"]
        return access_token

    def set(self, case: Any, data: str, context: Any) -> None:
        case.headers = {**(case.headers or {}), "Authorization": f"Bearer {data}"}


@schema.parametrize()
def test_api_keeps_its_openapi_contract(case: Any) -> None:
    # US #360 criteris 1, 2 i 3: no 5xx, respostes segons l'esquema i errors RFC 9457
    case.call_and_validate(additional_checks=[check_problem_details])
