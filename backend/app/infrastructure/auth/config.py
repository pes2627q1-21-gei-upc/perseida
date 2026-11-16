from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # One OAuth client per platform (web, Android, iOS), as a comma-separated
    # list: each client issues ID tokens with its own id as audience (aud).
    google_client_ids: Annotated[list[str], NoDecode] = Field(min_length=1)
    # HS256 needs a key of at least 256 bits (RFC 7518, section 3.2).
    jwt_secret: str = Field(min_length=32)
    access_token_minutes: int = Field(default=15, gt=0)
    refresh_token_days: int = Field(default=30, gt=0)

    @field_validator("google_client_ids", mode="before")
    @classmethod
    def _split_client_ids(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value
