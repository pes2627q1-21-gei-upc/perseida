"""Configuració del límit d'escriptura de publicacions (TG-645)."""

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.infrastructure.posts.config import PostsSettings


def test_tg645_settings_defaults() -> None:
    settings = PostsSettings(_env_file=None)
    assert (
        settings.posts_write_rate_limit,
        settings.posts_write_rate_limit_window_seconds,
    ) == (10, 60)


@pytest.mark.parametrize(
    "field", ["posts_write_rate_limit", "posts_write_rate_limit_window_seconds"]
)
def test_tg645_settings_must_be_positive(
    field: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(field.upper(), "0")
    with pytest.raises(PydanticValidationError):
        PostsSettings(_env_file=None)


def test_tg645_settings_are_read_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POSTS_WRITE_RATE_LIMIT", "3")
    monkeypatch.setenv("POSTS_WRITE_RATE_LIMIT_WINDOW_SECONDS", "30")
    settings = PostsSettings(_env_file=None)
    assert (
        settings.posts_write_rate_limit,
        settings.posts_write_rate_limit_window_seconds,
    ) == (3, 30)
