from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.application.users.errors import EMAIL_ALREADY_REGISTERED
from app.domain.shared.errors import ConflictError
from app.domain.users.models import User
from app.infrastructure.users.tables import UserIdentityRow, UserRow

GOOGLE = "google"


class _SubAlreadyLinked(Exception):  # noqa: N818
    """Internal: aborts the transaction of ``add`` when the identity exists."""


def _to_domain(row: UserRow, google_sub: str) -> User:
    return User(
        id=row.id,
        google_sub=google_sub,
        email=row.email,
        display_name=row.display_name,
        avatar_url=row.avatar_url,
        preferred_language=row.preferred_language,
        role=row.role,
        status=row.status,
        created_at=row.created_at,
        last_login_at=row.last_login_at,
        deleted_at=row.deleted_at,
    )


class SqlUserRepository:
    """``UserRepository`` on PostgreSQL; each call is its own transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_by_google_sub(self, google_sub: str) -> User | None:
        async with self._session_factory() as session:
            return await self._find(session, google_sub)

    async def add(self, user: User) -> User:
        if not await self._insert(user):
            existing = await self.get_by_google_sub(user.google_sub)
            if existing is None:
                raise ConflictError(EMAIL_ALREADY_REGISTERED)
            return existing
        return user

    async def _insert(self, user: User) -> bool:
        """Insert the account and its identity; False if it already existed."""
        try:
            async with self._session_factory() as session, session.begin():
                # ON CONFLICT DO NOTHING instead of insert + catch: a concurrent
                # insert of the same email waits for the first transaction and
                # then skips, so exactly one request creates the account.
                inserted = await session.execute(
                    insert(UserRow)
                    .values(
                        id=user.id,
                        email=user.email,
                        display_name=user.display_name,
                        avatar_url=user.avatar_url,
                        preferred_language=user.preferred_language.value,
                        role=user.role.value,
                        status=user.status.value,
                        created_at=user.created_at,
                        last_login_at=user.last_login_at,
                    )
                    .on_conflict_do_nothing(index_elements=[col(UserRow.email)])
                    .returning(col(UserRow.id))
                )
                if inserted.scalar_one_or_none() is None:
                    return False
                linked = await session.execute(
                    insert(UserIdentityRow)
                    .values(provider=GOOGLE, subject=user.google_sub, user_id=user.id)
                    .on_conflict_do_nothing()
                    .returning(col(UserIdentityRow.subject))
                )
                if linked.scalar_one_or_none() is None:
                    # The sub was registered meanwhile under another email: undo.
                    raise _SubAlreadyLinked
        except _SubAlreadyLinked:
            return False
        return True

    async def save_last_login(self, user: User) -> None:
        async with self._session_factory() as session, session.begin():
            row = await session.get(UserRow, user.id)
            if row is not None:
                row.last_login_at = user.last_login_at

    @staticmethod
    async def _find(session: AsyncSession, google_sub: str) -> User | None:
        result = await session.execute(
            select(UserRow)
            .join(UserIdentityRow, col(UserIdentityRow.user_id) == col(UserRow.id))
            .where(
                col(UserIdentityRow.provider) == GOOGLE,
                col(UserIdentityRow.subject) == google_sub,
            )
        )
        row = result.scalar_one_or_none()
        return None if row is None else _to_domain(row, google_sub)
