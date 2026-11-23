from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import HTTPConnection

from app.application.shared.error_codes import INSUFFICIENT_ROLE
from app.application.shared.errors import ForbiddenError
from app.application.users.user_service import UserService
from app.domain.users.models import Role, User
from app.infrastructure.auth.dependencies import CurrentSessionDep
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


def require_role(*roles: Role) -> Callable[..., Awaitable[User]]:
    """Dependency that lets in only the accounts whose role is one of ``roles``.

    No session answers 401 and another role 403 (``INSUFFICIENT_ROLE``). The role is
    read from the account on every request, so a change applies at once; a suspended
    or deleted account is a 403 whatever its role. Returns the account.
    """

    async def dependency(session: CurrentSessionDep, users: UserServiceDep) -> User:
        user = await users.get_profile(session.sub)
        if user.role not in roles:
            raise ForbiddenError(INSUFFICIENT_ROLE)
        return user

    return dependency
