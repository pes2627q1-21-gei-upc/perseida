from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.domain.chat.errors import MESSAGE_MAX_LENGTH


class ChatSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    chat_rate_limit_messages: int = Field(default=10, gt=0)
    chat_rate_limit_window_seconds: int = Field(default=10, gt=0)
    chat_message_max_length: int = Field(
        default=MESSAGE_MAX_LENGTH, ge=1, le=MESSAGE_MAX_LENGTH
    )
