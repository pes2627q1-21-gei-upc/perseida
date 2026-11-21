"""ApodActivityService registers the day activity best effort. TG-598 (US TG-58)."""

import logging

import pytest
from app.application.apod.apod_activity_service import ApodActivityService


class SpyRegistrar:
    def __init__(self, failure: Exception | None = None) -> None:
        self.subjects: list[str] = []
        self._failure = failure

    async def register(self, subject: str) -> None:
        self.subjects.append(subject)
        if self._failure is not None:
            raise self._failure


async def test_it_registers_the_activity_of_the_subject() -> None:
    registrar = SpyRegistrar()

    await ApodActivityService(registrar).register_visit("google-123")

    assert registrar.subjects == ["google-123"]


async def test_a_failure_is_swallowed_and_logged_as_a_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    registrar = SpyRegistrar(RuntimeError("database down"))

    with caplog.at_level("WARNING"):
        await ApodActivityService(registrar).register_visit("google-123")

    assert registrar.subjects == ["google-123"]  # it was tried
    records = [
        r
        for r in caplog.records
        if r.name == "app.application.apod.apod_activity_service"
    ]
    assert [r.levelno for r in records] == [logging.WARNING]


async def test_a_cancellation_is_not_swallowed() -> None:
    import asyncio

    registrar = SpyRegistrar(asyncio.CancelledError())

    with pytest.raises(asyncio.CancelledError):
        await ApodActivityService(registrar).register_visit("google-123")
