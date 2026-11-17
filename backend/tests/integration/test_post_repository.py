import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.domain.events.models import AstronomicalEvent, EventCategory
from app.domain.posts.models import Post, PostAuthor
from app.domain.users.models import User
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.posts.repository import SqlPostRepository
from app.infrastructure.users.repository import SqlUserRepository

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

NOW = datetime(2026, 11, 17, 10, 0, 0, tzinfo=UTC)


@pytest.fixture(scope="module")
def _migrated() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def session_factory(
    _migrated: None,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(DatabaseSettings().database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            await session.execute(text("TRUNCATE posts CASCADE"))
            await session.commit()
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
def post_repo(
    session_factory: async_sessionmaker[AsyncSession],
) -> SqlPostRepository:
    return SqlPostRepository(session_factory)


@pytest.fixture
def user_repo(
    session_factory: async_sessionmaker[AsyncSession],
) -> SqlUserRepository:
    return SqlUserRepository(session_factory)


@pytest.fixture
def event_repo(
    session_factory: async_sessionmaker[AsyncSession],
) -> SqlEventRepository:
    return SqlEventRepository(session_factory)


async def _create_test_user(
    user_repo: SqlUserRepository, email: str, name: str | None
) -> User:
    user = User.create(google_sub=f"sub-{uuid.uuid4()}", email=email, display_name=name)
    return await user_repo.add(user)


async def _create_test_event(event_repo: SqlEventRepository) -> AstronomicalEvent:
    from app.domain.events.models import EventDraft, EventSourceName

    draft = EventDraft(
        source=EventSourceName.CATALOG,
        external_id=f"test-event-{uuid.uuid4()}",
        title="Pluja d'estels Perseides",
        summary="Observació de meteors",
        category=EventCategory.METEOR_SHOWER,
        starts_at=NOW,
        ends_at=NOW + timedelta(hours=4),
    )
    await event_repo.upsert_many([draft])
    events = await event_repo.list_between(
        NOW - timedelta(days=1), NOW + timedelta(days=1)
    )
    return events[0]


async def test_create_and_get_post(
    post_repo: SqlPostRepository,
    user_repo: SqlUserRepository,
    event_repo: SqlEventRepository,
) -> None:
    user = await _create_test_user(user_repo, f"post-{uuid.uuid4()}@test.cat", "Laia")
    event = await _create_test_event(event_repo)

    author = PostAuthor(id=user.id, name=user.display_name)
    post = Post.create(event_id=event.id, author=author, text="Primera observació!")

    created = await post_repo.create(post)
    assert created.id == post.id

    fetched = await post_repo.get_by_id(post.id)
    assert fetched is not None
    assert fetched.id == post.id
    assert fetched.event_id == event.id
    assert fetched.author.id == user.id
    assert fetched.author.name == "Laia"
    assert fetched.text == "Primera observació!"
    assert fetched.edited_at is None


async def test_update_post(
    post_repo: SqlPostRepository,
    user_repo: SqlUserRepository,
    event_repo: SqlEventRepository,
) -> None:
    user = await _create_test_user(user_repo, f"post-{uuid.uuid4()}@test.cat", "Marc")
    event = await _create_test_event(event_repo)
    author = PostAuthor(id=user.id, name="Marc")
    post = await post_repo.create(
        Post.create(event_id=event.id, author=author, text="Borrador")
    )

    updated = post.edit("Versió corregida")
    await post_repo.update(updated)

    fetched = await post_repo.get_by_id(post.id)
    assert fetched is not None
    assert fetched.text == "Versió corregida"
    assert fetched.edited_at is not None


async def test_delete_post(
    post_repo: SqlPostRepository,
    user_repo: SqlUserRepository,
    event_repo: SqlEventRepository,
) -> None:
    user = await _create_test_user(user_repo, f"post-{uuid.uuid4()}@test.cat", "Oriol")
    event = await _create_test_event(event_repo)
    author = PostAuthor(id=user.id, name="Oriol")
    post = await post_repo.create(
        Post.create(event_id=event.id, author=author, text="A esborrar")
    )

    await post_repo.delete(post.id)
    assert await post_repo.get_by_id(post.id) is None


async def test_list_by_event_cursor_pagination(
    post_repo: SqlPostRepository,
    user_repo: SqlUserRepository,
    event_repo: SqlEventRepository,
) -> None:
    user = await _create_test_user(user_repo, f"post-{uuid.uuid4()}@test.cat", "Aina")
    event = await _create_test_event(event_repo)
    author = PostAuthor(id=user.id, name="Aina")

    p1 = await post_repo.create(
        Post.create(event_id=event.id, author=author, text="1", now=NOW)
    )
    p2 = await post_repo.create(
        Post.create(
            event_id=event.id, author=author, text="2", now=NOW + timedelta(seconds=1)
        )
    )
    p3 = await post_repo.create(
        Post.create(
            event_id=event.id, author=author, text="3", now=NOW + timedelta(seconds=2)
        )
    )

    page1 = await post_repo.list_by_event(event_id=event.id, limit=2)
    assert len(page1.posts) == 2
    assert page1.posts[0].id == p3.id
    assert page1.posts[1].id == p2.id
    assert page1.next_cursor is not None

    page2 = await post_repo.list_by_event(
        event_id=event.id, before=page1.next_cursor, limit=2
    )
    assert len(page2.posts) == 1
    assert page2.posts[0].id == p1.id
    assert page2.next_cursor is None


async def test_an_author_without_display_name_is_read_without_name(
    post_repo: SqlPostRepository,
    user_repo: SqlUserRepository,
    event_repo: SqlEventRepository,
) -> None:
    # El correu no surt mai com a nom public (TG-628, dades personals)
    user = await _create_test_user(user_repo, f"post-{uuid.uuid4()}@test.cat", None)
    event = await _create_test_event(event_repo)
    post = Post.create(
        event_id=event.id, author=PostAuthor(id=user.id, name=None), text="Hola"
    )
    await post_repo.create(post)

    fetched = await post_repo.get_by_id(post.id)
    page = await post_repo.list_by_event(event.id)

    assert fetched is not None
    assert fetched.author.name is None
    assert [p.author.name for p in page.posts if p.id == post.id] == [None]
