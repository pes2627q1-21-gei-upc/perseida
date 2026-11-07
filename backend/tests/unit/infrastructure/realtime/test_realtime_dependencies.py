from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import MagicMock

from starlette.requests import HTTPConnection

from app.application.realtime.realtime_session import RealtimeConfig
from app.infrastructure.auth.dependencies import get_session_store
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.realtime.dependencies import get_realtime_config


def _conn(**state: Any) -> HTTPConnection:
    app = SimpleNamespace(state=SimpleNamespace(**state))
    return cast(HTTPConnection, SimpleNamespace(app=app))


def test_the_session_store_is_a_redis_store_over_the_app_redis() -> None:
    store = get_session_store(_conn(redis=MagicMock()))

    assert isinstance(store, RedisSessionStore)


def test_the_realtime_config_comes_from_the_app_state() -> None:
    config = RealtimeConfig(auth_timeout_seconds=1, heartbeat_seconds=2)

    assert get_realtime_config(_conn(realtime_config=config)) is config
