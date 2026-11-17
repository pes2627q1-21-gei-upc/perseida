import uuid

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.posts.models import Post, PostAuthor, PostCursor, PostRepositoryPage
from app.infrastructure.posts.tables import PostRow
from app.infrastructure.users.tables import UserRow


def _to_domain(row: PostRow, author_name: str | None) -> Post:
    return Post(
        id=row.id,
        event_id=row.event_id,
        author=PostAuthor(id=row.user_id, name=author_name),
        text=row.text,
        created_at=row.created_at,
        edited_at=row.edited_at,
    )


class SqlPostRepository:
    """PostgreSQL storage of event posts with cursor pagination and joins for author."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def create(self, post: Post) -> Post:
        row = PostRow(
            id=post.id,
            event_id=post.event_id,
            user_id=post.author.id,
            text=post.text,
            created_at=post.created_at,
            edited_at=post.edited_at,
        )
        async with self._session_factory() as session, session.begin():
            session.add(row)
        return post

    async def get_by_id(self, post_id: uuid.UUID) -> Post | None:
        stmt = (
            select(PostRow, col(UserRow.display_name))
            .join(UserRow, col(PostRow.user_id) == col(UserRow.id))
            .where(col(PostRow.id) == post_id)
        )
        async with self._session_factory() as session:
            result = await session.execute(stmt)
            record = result.first()
            if record is None:
                return None
            row, display_name = record
            return _to_domain(row, display_name)

    async def update(self, post: Post) -> Post:
        async with self._session_factory() as session, session.begin():
            result = await session.execute(
                select(PostRow).where(col(PostRow.id) == post.id)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                row.text = post.text
                row.edited_at = post.edited_at
        return post

    async def delete(self, post_id: uuid.UUID) -> None:
        async with self._session_factory() as session, session.begin():
            result = await session.execute(
                select(PostRow).where(col(PostRow.id) == post_id)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                await session.delete(row)

    async def list_by_event(
        self,
        event_id: uuid.UUID,
        *,
        before: PostCursor | None = None,
        limit: int = 20,
    ) -> PostRepositoryPage:
        stmt = (
            select(PostRow, col(UserRow.display_name))
            .join(UserRow, col(PostRow.user_id) == col(UserRow.id))
            .where(col(PostRow.event_id) == event_id)
        )
        if before is not None:
            # Row comparison: PostgreSQL uses it as an index condition on
            # ix_posts_event_id_created_at_id, so deep pages do not scan the rest.
            stmt = stmt.where(
                tuple_(col(PostRow.created_at), col(PostRow.id))
                < tuple_(before.created_at, before.id)
            )
        stmt = stmt.order_by(
            col(PostRow.created_at).desc(), col(PostRow.id).desc()
        ).limit(limit + 1)

        async with self._session_factory() as session:
            result = await session.execute(stmt)
            records = result.all()

        has_more = len(records) > limit
        slice_records = records[:limit]
        posts = [_to_domain(rec[0], rec[1]) for rec in slice_records]
        next_cursor = None
        if has_more and posts:
            last = posts[-1]
            next_cursor = PostCursor(created_at=last.created_at, id=last.id)
        return PostRepositoryPage(posts=posts, next_cursor=next_cursor)
