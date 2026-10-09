
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.infrastructure.persistence.session import get_session


def create_request(session):
    context_manager = MagicMock()
    context_manager.__aenter__ = AsyncMock(return_value=session)
    context_manager.__aexit__ = AsyncMock(return_value=False)

    request = MagicMock()
    request.app.state.session_factory = MagicMock(
        return_value=context_manager
    )
    return request


async def test_session_commits_on_success():
    session = MagicMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    request = create_request(session)

    generator = get_session(request)

    assert await anext(generator) is session

    with pytest.raises(StopAsyncIteration):
        await anext(generator)

    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()
    context_manager = request.app.state.session_factory.return_value
    context_manager.__aexit__.assert_awaited_once()


async def test_session_rolls_back_on_error():
    session = MagicMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    request = create_request(session)

    generator = get_session(request)

    assert await anext(generator) is session

    with pytest.raises(RuntimeError, match="Database error"):
        await generator.athrow(RuntimeError("Database error"))

    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()
    context_manager = request.app.state.session_factory.return_value
    context_manager.__aexit__.assert_awaited_once()
