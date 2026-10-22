from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class NasaSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nasa_api_key: SecretStr = Field(min_length=1)
    nasa_connect_timeout_seconds: float = Field(default=3.0, gt=0)
    nasa_timeout_seconds: float = Field(default=10.0, gt=0)
