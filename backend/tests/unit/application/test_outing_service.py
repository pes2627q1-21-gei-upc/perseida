import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.outings.outing_service import OutingService
from app.application.shared.errors import ForbiddenError
from app.domain.events.models import AstronomicalEvent, EventCategory
from app.domain.outings.errors import (
    OUTING_EVENT_NOT_FOUND,
    OUTING_FORBIDDEN,
    OUTING_NOT_FOUND,
    OUTING_STARTS_IN_PAST,
)
from app.domain.outings.models import OutingAuthor, OutingChanges
from app.domain.shared.errors import NotFoundError, ValidationError
from app.domain.shared.location import Location
from tests.fakes.events import FakeEventRepository
from tests.fakes.outings import FakeOutingRepository

NOW = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)
ANNA = OutingAuthor(id=uuid.uuid7(), display_name="Anna", avatar_url=None)
BIEL = OutingAuthor(id=uuid.uuid7(), display_name="Biel", avatar_url=None)
MONTSEC = Location(latitude=42.0517, longitude=0.7296)
PERSEIDS = AstronomicalEvent(
    id=uuid.uuid7(),
    title="Perseides",
    summary="Pluja d'estels",
    category=EventCategory.METEOR_SHOWER,
    starts_at=NOW,
    ends_at=NOW + timedelta(days=3),
)


def _service() -> tuple[OutingService, FakeOutingRepository]:
    repository = FakeOutingRepository([ANNA, BIEL])
    service = OutingService(repository, FakeEventRepository([PERSEIDS]), lambda: NOW)
    return service, repository


async def _create(
    service: OutingService,
    *,
    author: OutingAuthor = ANNA,
    starts_in: timedelta = timedelta(days=1),
    event_id: uuid.UUID | None = None,
) -> uuid.UUID:
    details = await service.create(
        author.id,
        title="Perseides al Montsec",
        description="",
        starts_at=NOW + starts_in,
        ends_at=NOW + starts_in + timedelta(hours=3),
        location=MONTSEC,
        event_id=event_id,
    )
    return details.outing.id


# --- create ---------------------------------------------------------------------


async def test_create_stores_the_outing_and_returns_it_with_its_author() -> None:
    # TG-629 criteri 1: crea una sortida de la usuària autenticada
    service, repository = _service()

    details = await service.create(
        ANNA.id,
        title="Perseides al Montsec",
        description="Portem termos.",
        starts_at=NOW + timedelta(days=1),
        ends_at=NOW + timedelta(days=1, hours=3),
        location=MONTSEC,
        event_id=PERSEIDS.id,
    )

    assert details.author == ANNA
    assert details.outing.author_id == ANNA.id
    assert details.outing.event_id == PERSEIDS.id
    assert details.outing.created_at == NOW
    assert repository.outings[details.outing.id] == details.outing


async def test_create_uses_the_clock_to_reject_a_start_in_the_past() -> None:
    service, repository = _service()

    with pytest.raises(ValidationError) as error:
        await _create(service, starts_in=-timedelta(minutes=1))

    assert error.value.code == OUTING_STARTS_IN_PAST
    assert repository.outings == {}


async def test_create_with_an_unknown_event_is_a_validation_error() -> None:
    # Decisió de Raquel (17/11/2026): 422 OUTING_EVENT_NOT_FOUND
    service, repository = _service()

    with pytest.raises(ValidationError) as error:
        await _create(service, event_id=uuid.uuid7())

    assert error.value.code == OUTING_EVENT_NOT_FOUND
    assert repository.outings == {}


# --- list and get ---------------------------------------------------------------


async def test_list_returns_the_upcoming_outings_sorted_by_start() -> None:
    # TG-629 criteri 2: sortides futures ordenades per inici
    service, repository = _service()
    later = await _create(service, starts_in=timedelta(days=2))
    sooner = await _create(service, author=BIEL, starts_in=timedelta(hours=1))
    past = await _create(service, starts_in=timedelta(hours=1))
    repository.outings[past] = repository.outings[past].model_copy(
        update={"starts_at": NOW - timedelta(hours=1)}
    )

    listed = await service.list_upcoming()

    assert [details.outing.id for details in listed] == [sooner, later]


async def test_list_filters_by_event() -> None:
    # TG-629 criteri 2: filtre opcional per esdeveniment
    service, _ = _service()
    linked = await _create(service, event_id=PERSEIDS.id)
    await _create(service)

    listed = await service.list_upcoming(event_id=PERSEIDS.id)

    assert [details.outing.id for details in listed] == [linked]


async def test_list_filters_by_author() -> None:
    # Decisió de Raquel (17/11/2026): «les meves sortides» amb ?mine=true
    service, _ = _service()
    mine = await _create(service, author=BIEL)
    await _create(service)

    listed = await service.list_upcoming(author_id=BIEL.id)

    assert [details.outing.id for details in listed] == [mine]


async def test_get_returns_the_outing_with_its_author() -> None:
    # TG-629 criteri 2: detall amb l'autora
    service, _ = _service()
    outing_id = await _create(service, author=BIEL)

    details = await service.get(outing_id)

    assert details.outing.id == outing_id
    assert details.author == BIEL


async def test_get_of_an_unknown_outing_is_not_found() -> None:
    # TG-629 criteri 3: 404 si no existeix
    service, _ = _service()

    with pytest.raises(NotFoundError) as error:
        await service.get(uuid.uuid7())

    assert error.value.code == OUTING_NOT_FOUND


# --- update ---------------------------------------------------------------------


async def test_the_author_can_update_her_outing() -> None:
    # TG-629 criteri 3: l'autora pot editar
    service, repository = _service()
    outing_id = await _create(service)

    details = await service.update(ANNA.id, outing_id, OutingChanges(title="Nou"))

    assert details.outing.title == "Nou"
    assert details.outing.updated_at == NOW
    assert repository.outings[outing_id].title == "Nou"


async def test_someone_else_cannot_update_an_outing() -> None:
    # TG-629 criteri 3: 403 si no és l'autora
    service, repository = _service()
    outing_id = await _create(service)

    with pytest.raises(ForbiddenError) as error:
        await service.update(BIEL.id, outing_id, OutingChanges(title="Meva"))

    assert error.value.code == OUTING_FORBIDDEN
    assert repository.outings[outing_id].title == "Perseides al Montsec"


async def test_update_of_an_unknown_outing_is_not_found() -> None:
    service, _ = _service()

    with pytest.raises(NotFoundError) as error:
        await service.update(ANNA.id, uuid.uuid7(), OutingChanges(title="Nou"))

    assert error.value.code == OUTING_NOT_FOUND


async def test_update_to_an_unknown_event_is_a_validation_error() -> None:
    service, _ = _service()
    outing_id = await _create(service)

    with pytest.raises(ValidationError) as error:
        await service.update(ANNA.id, outing_id, OutingChanges(event_id=uuid.uuid7()))

    assert error.value.code == OUTING_EVENT_NOT_FOUND


async def test_update_can_link_an_existing_event_and_unlink_it() -> None:
    service, _ = _service()
    outing_id = await _create(service)

    linked = await service.update(
        ANNA.id, outing_id, OutingChanges(event_id=PERSEIDS.id)
    )
    unlinked = await service.update(ANNA.id, outing_id, OutingChanges(event_id=None))

    assert linked.outing.event_id == PERSEIDS.id
    assert unlinked.outing.event_id is None


# --- delete ---------------------------------------------------------------------


async def test_the_author_can_delete_her_outing() -> None:
    # TG-629 criteri 3: l'autora pot esborrar
    service, repository = _service()
    outing_id = await _create(service)

    await service.delete(ANNA.id, outing_id)

    assert outing_id not in repository.outings


async def test_someone_else_cannot_delete_an_outing() -> None:
    # TG-629 criteri 3: 403 si no és l'autora
    service, repository = _service()
    outing_id = await _create(service)

    with pytest.raises(ForbiddenError) as error:
        await service.delete(BIEL.id, outing_id)

    assert error.value.code == OUTING_FORBIDDEN
    assert outing_id in repository.outings


async def test_delete_of_an_unknown_outing_is_not_found() -> None:
    # TG-629 criteri 3: 404 si no existeix
    service, _ = _service()

    with pytest.raises(NotFoundError) as error:
        await service.delete(ANNA.id, uuid.uuid7())

    assert error.value.code == OUTING_NOT_FOUND
