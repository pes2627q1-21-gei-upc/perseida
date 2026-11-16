from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import HTTPConnection

from app.application.users.user_service import UserService
from app.infrastructure.users.repository import SqlUserRepository


def build_user_service(
    session_factory: async_sessionmaker[AsyncSession],
) -> UserService:
    """Wire the user service; called once from the lifespan, which owns the engine."""
    return UserService(SqlUserRepository(session_factory))


def get_user_service(conn: HTTPConnection) -> UserService:
    # Built in the lifespan because it needs the engine's session factory.
    service: UserService = conn.app.state.user_service
    return service


UserServiceDep = Annotated[UserService, Depends(get_user_service)]
