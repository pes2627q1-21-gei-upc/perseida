from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    redis_host: str = Field(min_length=1)
    redis_port: int = Field(gt=0, le=65535)
    cache_default_ttl_seconds: int = Field(default=3600, gt=0)
    redis_socket_timeout_seconds: float = Field(default=2.0, gt=0)

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}"
