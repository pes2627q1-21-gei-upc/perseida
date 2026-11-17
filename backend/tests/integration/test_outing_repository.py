"""SqlOutingRepository against a real PostgreSQL (TG-629, task #639)."""

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.domain.events.models import Location
from app.domain.outings.models import Outing, OutingAuthor, OutingChanges
from app.domain.users.models import User
from app.infrastructure.outings.repository import SqlOutingRepository
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.repository import SqlUserRepository
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

NOW = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)
MONTSEC = Location(latitude=42.0517, longitude=0.7296)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def connection() -> AsyncIterator[AsyncConnection]:
    """One connection inside a transaction that is rolled back after the test."""
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                yield connection
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
def factory(connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )


@pytest.fixture
def repo(factory: async_sessionmaker[AsyncSession]) -> SqlOutingRepository:
    return SqlOutingRepository(factory)


async def _user(factory: async_sessionmaker[AsyncSession], name: str) -> User:
    sub = f"outing-repo-{uuid.uuid4().hex}"
    user = User.create(
        google_sub=sub,
        email=f"{sub}@example.test",
        display_name=name,
        avatar_url="https://example.test/a.png",
    )
    return await SqlUserRepository(factory).add(user)


def _outing(
    author: User,
    *,
    starts_in: timedelta = timedelta(days=1),
    event_id: uuid.UUID | None = None,
) -> Outing:
    return Outing.create(
        author_id=author.id,
        title="Perseides al Montsec",
        description="Punt de trobada:\npàrquing",
        starts_at=NOW + starts_in,
        ends_at=NOW + starts_in + timedelta(hours=3),
        location=MONTSEC,
        event_id=event_id,
        now=NOW,
    )


async def _event_id(connection: AsyncConnection) -> uuid.UUID:
    result = await connection.execute(
        text(
            "INSERT INTO astronomical_events"
            " (source, external_id, title, summary, category, starts_at, ends_at)"
            " VALUES ('catalog', :external_id, 'Perseides', 'Pluja', 'meteor_shower',"
            " :starts_at, :ends_at) RETURNING id"
        ),
        {
            "external_id": f"outing-repo-{uuid.uuid4().hex}",
            "starts_at": NOW,
            "ends_at": NOW + timedelta(days=3),
        },
    )
    event_id: uuid.UUID = result.scalar_one()
    return event_id


async def test_add_and_get_round_trip_with_the_author(
    repo: SqlOutingRepository, factory: async_sessionmaker[AsyncSession]
) -> None:
    # TG-629 criteri 2: detall amb l'autora
    anna = await _user(factory, "Anna")
    outing = _outing(anna)

    await repo.add(outing)
    details = await repo.get(outing.id)

    assert details is not None
    assert details.outing == outing
    assert details.author == OutingAuthor(
        id=anna.id, display_name="Anna", avatar_url="https://example.test/a.png"
    )


async def test_get_of_an_unknown_outing_is_none(repo: SqlOutingRepository) -> None:
    assert await repo.get(uuid.uuid7()) is None


async def test_save_stores_the_new_values(
    repo: SqlOutingRepository, factory: async_sessionmaker[AsyncSession]
) -> None:
    anna = await _user(factory, "Anna")
    outing = _outing(anna)
    await repo.add(outing)

    updated = outing.update(
        OutingChanges(title="Nou títol", location=Location(latitude=1, longitude=2)),
        now=NOW + timedelta(hours=1),
    )
    await repo.save(updated)
    details = await repo.get(outing.id)

    assert details is not None
    assert details.outing == updated


async def test_delete_removes_the_outing(
    repo: SqlOutingRepository, factory: async_sessionmaker[AsyncSession]
) -> None:
    anna = await _user(factory, "Anna")
    outing = _outing(anna)
    await repo.add(outing)

    await repo.delete(outing.id)
    await repo.delete(outing.id)

    assert await repo.get(outing.id) is None


async def test_list_upcoming_sorts_by_start_and_leaves_out_the_past(
    repo: SqlOutingRepository, factory: async_sessionmaker[AsyncSession]
) -> None:
    # TG-629 criteri 2: sortides futures ordenades per inici
    anna = await _user(factory, "Anna")
    later = _outing(anna, starts_in=timedelta(days=2))
    sooner = _outing(anna, starts_in=timedelta(hours=1))
    started = _outing(anna, starts_in=timedelta(hours=1))
    for outing in (later, sooner, started):
        await repo.add(outing)

    listed = await repo.list_upcoming(NOW + timedelta(minutes=30))
    ids = [details.outing.id for details in listed]

    assert ids.index(sooner.id) < ids.index(later.id)
    assert started.id in ids
    after = await repo.list_upcoming(NOW + timedelta(hours=2))
    assert sooner.id not in [details.outing.id for details in after]


async def test_list_upcoming_filters_by_event_and_by_author(
    repo: SqlOutingRepository,
    factory: async_sessionmaker[AsyncSession],
    connection: AsyncConnection,
) -> None:
    anna = await _user(factory, "Anna")
    biel = await _user(factory, "Biel")
    event_id = await _event_id(connection)
    linked = _outing(anna, event_id=event_id)
    of_biel = _outing(biel)
    for outing in (linked, of_biel):
        await repo.add(outing)

    by_event = await repo.list_upcoming(NOW, event_id=event_id)
    by_author = await repo.list_upcoming(NOW, author_id=biel.id)

    assert [details.outing.id for details in by_event] == [linked.id]
    assert [details.outing.id for details in by_author] == [of_biel.id]
    assert by_author[0].author.display_name == "Biel"


async def test_an_outing_of_an_unknown_event_is_rejected_by_the_database(
    repo: SqlOutingRepository, factory: async_sessionmaker[AsyncSession]
) -> None:
    # La clau forana és la defensa en profunditat del 422 OUTING_EVENT_NOT_FOUND
    anna = await _user(factory, "Anna")

    with pytest.raises(IntegrityError):
        await repo.add(_outing(anna, event_id=uuid.uuid7()))


async def test_outings_never_appear_in_the_astronomical_events(
    repo: SqlOutingRepository,
    factory: async_sessionmaker[AsyncSession],
    connection: AsyncConnection,
) -> None:
    # TG-629 criteri 5: les sortides són una taula a part
    anna = await _user(factory, "Anna")
    before = await connection.execute(text("SELECT count(*) FROM astronomical_events"))
    count_before = before.scalar_one()

    await repo.add(_outing(anna))

    after = await connection.execute(text("SELECT count(*) FROM astronomical_events"))
    assert after.scalar_one() == count_before
