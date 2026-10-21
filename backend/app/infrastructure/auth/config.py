from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    google_client_id: str = Field(min_length=1)
    # HS256 needs a key of at least 256 bits (RFC 7518, section 3.2).
    jwt_secret: str = Field(min_length=32)
    access_token_minutes: int = Field(default=15, gt=0)
    refresh_token_days: int = Field(default=30, gt=0)
