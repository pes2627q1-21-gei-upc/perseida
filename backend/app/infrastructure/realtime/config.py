from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.application.realtime.realtime_session import RealtimeConfig


class RealtimeSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ws_auth_timeout_seconds: float = Field(default=10.0, gt=0)
    ws_heartbeat_seconds: float = Field(default=30.0, gt=0)
    ws_send_timeout_seconds: float = Field(default=5.0, gt=0)
    ws_max_rooms: int = Field(default=20, gt=0)
    ws_max_frame_bytes: int = Field(default=65536, gt=0)

    def config(self) -> RealtimeConfig:
        return RealtimeConfig(
            auth_timeout_seconds=self.ws_auth_timeout_seconds,
            heartbeat_seconds=self.ws_heartbeat_seconds,
            send_timeout_seconds=self.ws_send_timeout_seconds,
            max_rooms=self.ws_max_rooms,
            max_frame_bytes=self.ws_max_frame_bytes,
        )
