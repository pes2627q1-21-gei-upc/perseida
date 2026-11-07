from starlette.requests import HTTPConnection

from app.application.realtime.realtime_session import RealtimeConfig


def get_realtime_config(conn: HTTPConnection) -> RealtimeConfig:
    config: RealtimeConfig = conn.app.state.realtime_config
    return config
