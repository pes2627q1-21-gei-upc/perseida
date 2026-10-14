from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.persistence.session import get_session


def create_request(
    session: AsyncSession,
) -> tuple[Request, MagicMock]:
    context_manager = MagicMock()
    context_manager.__aenter__ = AsyncMock(return_value=session)
    context_manager.__aexit__ = AsyncMock(return_value=False)

    request = MagicMock(spec=Request)
    request.app.state.session_factory = MagicMock(return_value=context_manager)
    return request, context_manager


async def test_session_commits_on_success() -> None:
    session = MagicMock(spec=AsyncSession)
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    request, context_manager = create_request(session)

    generator: AsyncGenerator[AsyncSession] = get_session(request)

    assert await anext(generator) is session

    with pytest.raises(StopAsyncIteration):
        await anext(generator)

    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()
    context_manager.__aexit__.assert_awaited_once()


async def test_session_rolls_back_on_error() -> None:
    session = MagicMock(spec=AsyncSession)
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    request, context_manager = create_request(session)

    generator: AsyncGenerator[AsyncSession] = get_session(request)

    assert await anext(generator) is session

    with pytest.raises(RuntimeError, match="Database error"):
        await generator.athrow(RuntimeError("Database error"))

    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()
    context_manager.__aexit__.assert_awaited_once()
