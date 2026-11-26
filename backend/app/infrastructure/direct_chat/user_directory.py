import uuid

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.infrastructure.persistence.errors import database_errors
from app.infrastructure.users.tables import UserRow


class SqlChatUserDirectory:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def exists(self, user_id: uuid.UUID) -> bool:
        statement = select(
            exists().where(
                col(UserRow.id) == user_id, col(UserRow.deleted_at).is_(None)
            )
        )
        with database_errors():
            async with self._session_factory() as session:
                return bool(await session.scalar(statement))
