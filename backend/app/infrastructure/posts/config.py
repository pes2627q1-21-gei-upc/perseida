from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class PostsSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    posts_write_rate_limit: int = Field(default=10, gt=0)
    posts_write_rate_limit_window_seconds: int = Field(default=60, gt=0)
