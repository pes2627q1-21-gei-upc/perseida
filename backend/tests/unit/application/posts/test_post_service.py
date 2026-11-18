import logging
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.posts.post_service import PostService
from app.application.shared.error_codes import RATE_LIMITED
from app.application.shared.errors import ForbiddenError, RateLimitedError
from app.domain.posts.errors import POST_TEXT_EMPTY
from app.domain.posts.models import Post, PostAuthor
from app.domain.shared.errors import NotFoundError, ValidationError
from tests.fakes.events import FakeEventRepository
from tests.fakes.posts import FakePostRepository, FakeRateLimiter

EVENT_ID = uuid.uuid7()
AUTHOR_ID = uuid.uuid7()
OTHER_USER_ID = uuid.uuid7()
AUTHOR = PostAuthor(id=AUTHOR_ID, name="Sara Astrònoma")
OTHER_AUTHOR = PostAuthor(id=OTHER_USER_ID, name="Usuari No Autor")


class FakeEventRepoWithSingleEvent(FakeEventRepository):
    def __init__(self, valid_event_id: uuid.UUID) -> None:
        super().__init__()
        self._valid_event_id = valid_event_id

    async def exists(self, event_id: uuid.UUID) -> bool:
        return event_id == self._valid_event_id


@pytest.fixture
def event_repo() -> FakeEventRepoWithSingleEvent:
    return FakeEventRepoWithSingleEvent(valid_event_id=EVENT_ID)


@pytest.fixture
def post_repo() -> FakePostRepository:
    return FakePostRepository()


@pytest.fixture
def limiter() -> FakeRateLimiter:
    return FakeRateLimiter()


@pytest.fixture
def service(
    post_repo: FakePostRepository,
    event_repo: FakeEventRepoWithSingleEvent,
    limiter: FakeRateLimiter,
) -> PostService:
    return PostService(post_repo, event_repo, limiter)


# --- Creació de publicació (TG-628 criteri 1) ---


async def test_create_post_success(
    service: PostService, post_repo: FakePostRepository
) -> None:
    # TG-628 criteri 1: crea una publicació de la usuària autenticada
    post = await service.create_post(
        event_id=EVENT_ID,
        author=AUTHOR,
        text="  Observant la conjunció de Júpiter i Mart!  ",
    )

    assert post.id in post_repo.posts
    assert post.event_id == EVENT_ID
    assert post.author == AUTHOR
    assert post.text == "Observant la conjunció de Júpiter i Mart!"
    assert post.edited_at is None


async def test_create_post_fails_when_event_not_found(service: PostService) -> None:
    # TG-628 criteri 1: un esdeveniment inexistent dona 404
    missing_event_id = uuid.uuid7()
    with pytest.raises(NotFoundError) as exc:
        await service.create_post(
            event_id=missing_event_id,
            author=AUTHOR,
            text="Text vàlid",
        )
    assert exc.value.code == "EVENT_NOT_FOUND"


async def test_create_post_validates_domain_invariants(service: PostService) -> None:
    # TG-628 criteri 1: text invàlid dona 422 (ValidationError)
    with pytest.raises(ValidationError) as exc:
        await service.create_post(
            event_id=EVENT_ID,
            author=AUTHOR,
            text="   ",
        )
    assert exc.value.code == POST_TEXT_EMPTY


# --- Llistat paginat de publicacions (TG-628 criteri 2) ---


async def test_list_posts_newest_first_with_pagination(
    service: PostService, post_repo: FakePostRepository
) -> None:
    # TG-628 criteri 2: llista de la més nova a la més antiga paginades per cursor
    t0 = datetime(2026, 11, 1, 10, 0, tzinfo=UTC)
    t1 = t0 + timedelta(minutes=10)
    t2 = t0 + timedelta(minutes=20)

    p0 = Post.create(event_id=EVENT_ID, author=AUTHOR, text="Primer", now=t0)
    p1 = Post.create(event_id=EVENT_ID, author=AUTHOR, text="Segon", now=t1)
    p2 = Post.create(event_id=EVENT_ID, author=AUTHOR, text="Tercer", now=t2)
    for p in (p0, p1, p2):
        await post_repo.create(p)

    # Demanem límit 2
    page1 = await service.list_posts(event_id=EVENT_ID, limit=2)
    assert len(page1.posts) == 2
    assert page1.posts[0].text == "Tercer"
    assert page1.posts[1].text == "Segon"
    assert page1.next_cursor is not None

    # Demanem la segona pàgina amb el cursor
    page2 = await service.list_posts(
        event_id=EVENT_ID, cursor=page1.next_cursor, limit=2
    )
    assert len(page2.posts) == 1
    assert page2.posts[0].text == "Primer"
    assert page2.next_cursor is None


async def test_list_posts_fails_when_event_not_found(service: PostService) -> None:
    missing_event_id = uuid.uuid7()
    with pytest.raises(NotFoundError) as exc:
        await service.list_posts(event_id=missing_event_id)
    assert exc.value.code == "EVENT_NOT_FOUND"


async def test_list_posts_rejects_invalid_cursor(service: PostService) -> None:
    with pytest.raises(ValidationError) as exc:
        await service.list_posts(event_id=EVENT_ID, cursor="cursor-corrupte-invalid")
    assert exc.value.code == "INVALID_CURSOR"


# --- Edició de publicació (TG-628 criteri 3) ---


async def test_update_post_success_for_author(
    service: PostService, post_repo: FakePostRepository
) -> None:
    # TG-628 criteri 3: edita el text i desa edited_at; només l'autora
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Text original")
    )

    updated = await service.update_post(
        post_id=post.id,
        author_id=AUTHOR_ID,
        new_text="Text modificat i millorat",
    )

    assert updated.text == "Text modificat i millorat"
    assert updated.edited_at is not None
    stored = await post_repo.get_by_id(post.id)
    assert stored is not None
    assert stored.text == "Text modificat i millorat"


async def test_update_post_fails_with_forbidden_for_other_user(
    service: PostService, post_repo: FakePostRepository
) -> None:
    # TG-628 criteri 3: 403 si no és l'autora
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Text original")
    )

    with pytest.raises(ForbiddenError) as exc:
        await service.update_post(
            post_id=post.id,
            author_id=OTHER_USER_ID,
            new_text="Intent d'edició no autoritzada",
        )
    assert exc.value.code == "POST_FORBIDDEN"
    # El post original no s'ha modificat
    stored = await post_repo.get_by_id(post.id)
    assert stored is not None
    assert stored.text == "Text original"


async def test_update_post_fails_when_post_not_found(service: PostService) -> None:
    # TG-628 criteri 3: 404 si no existeix
    missing_post_id = uuid.uuid7()
    with pytest.raises(NotFoundError) as exc:
        await service.update_post(
            post_id=missing_post_id,
            author_id=AUTHOR_ID,
            new_text="Text",
        )
    assert exc.value.code == "POST_NOT_FOUND"


# --- Esborrat de publicació (TG-628 criteri 4) ---


async def test_delete_post_success_for_author(
    service: PostService, post_repo: FakePostRepository
) -> None:
    # TG-628 criteri 4: l'esborra; només ho pot fer l'autora
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Per esborrar")
    )

    await service.delete_post(post_id=post.id, author_id=AUTHOR_ID)

    assert await post_repo.get_by_id(post.id) is None


async def test_delete_post_fails_with_forbidden_for_other_user(
    service: PostService, post_repo: FakePostRepository
) -> None:
    # TG-628 criteri 4: 403 si no és l'autora
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="No esborrar")
    )

    with pytest.raises(ForbiddenError) as exc:
        await service.delete_post(post_id=post.id, author_id=OTHER_USER_ID)
    assert exc.value.code == "POST_FORBIDDEN"
    # El post continua existint
    assert await post_repo.get_by_id(post.id) is not None


async def test_delete_post_fails_when_post_not_found(service: PostService) -> None:
    # TG-628 criteri 4: 404 si no existeix
    missing_post_id = uuid.uuid7()
    with pytest.raises(NotFoundError) as exc:
        await service.delete_post(post_id=missing_post_id, author_id=AUTHOR_ID)
    assert exc.value.code == "POST_NOT_FOUND"


# --- Límit d'edició i esborrat per usuària (TG-645) ---


async def test_tg645_update_over_the_limit_is_rate_limited(
    service: PostService, post_repo: FakePostRepository, limiter: FakeRateLimiter
) -> None:
    # TG-645: superar el límit en editar dona RATE_LIMITED i no canvia res
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Text original")
    )
    limiter.allowed = False

    with pytest.raises(RateLimitedError) as exc:
        await service.update_post(
            post_id=post.id, author_id=AUTHOR_ID, new_text="Nou text"
        )

    assert exc.value.code == RATE_LIMITED
    assert post_repo.posts[post.id].text == "Text original"


async def test_tg645_delete_over_the_limit_is_rate_limited(
    service: PostService, post_repo: FakePostRepository, limiter: FakeRateLimiter
) -> None:
    # TG-645: superar el límit en esborrar dona RATE_LIMITED i el post es manté
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Es queda")
    )
    limiter.allowed = False

    with pytest.raises(RateLimitedError) as exc:
        await service.delete_post(post_id=post.id, author_id=AUTHOR_ID)

    assert exc.value.code == RATE_LIMITED
    assert post.id in post_repo.posts


async def test_tg645_under_the_limit_update_and_delete_count_by_author(
    service: PostService, post_repo: FakePostRepository, limiter: FakeRateLimiter
) -> None:
    # TG-645: per sota del límit funcionen i cada operació compta per author_id
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Text original")
    )

    updated = await service.update_post(
        post_id=post.id, author_id=AUTHOR_ID, new_text="Editat"
    )
    await service.delete_post(post_id=post.id, author_id=AUTHOR_ID)

    assert updated.text == "Editat"
    assert post.id not in post_repo.posts
    assert limiter.hits == [AUTHOR_ID, AUTHOR_ID]


@pytest.mark.parametrize("operation", ["update", "delete"])
async def test_tg645_the_limit_is_checked_before_looking_up_the_post(
    service: PostService, limiter: FakeRateLimiter, operation: str
) -> None:
    # TG-645: amb el límit esgotat, un post inexistent dona RATE_LIMITED (no 404)
    limiter.allowed = False
    missing_post_id = uuid.uuid7()

    with pytest.raises(RateLimitedError):
        if operation == "update":
            await service.update_post(
                post_id=missing_post_id, author_id=AUTHOR_ID, new_text="Text"
            )
        else:
            await service.delete_post(post_id=missing_post_id, author_id=AUTHOR_ID)


@pytest.mark.parametrize("operation", ["update", "delete"])
async def test_tg645_the_limit_is_checked_before_ownership(
    service: PostService,
    post_repo: FakePostRepository,
    limiter: FakeRateLimiter,
    operation: str,
) -> None:
    # TG-645: amb el límit esgotat, un post ajeno tampoc arriba a POST_FORBIDDEN
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="De l'autora")
    )
    limiter.allowed = False

    with pytest.raises(RateLimitedError):
        if operation == "update":
            await service.update_post(
                post_id=post.id, author_id=OTHER_USER_ID, new_text="Text"
            )
        else:
            await service.delete_post(post_id=post.id, author_id=OTHER_USER_ID)

    assert limiter.hits == [OTHER_USER_ID]


async def test_tg645_limiter_unavailable_fails_open_with_a_warning(
    service: PostService,
    post_repo: FakePostRepository,
    limiter: FakeRateLimiter,
    caplog: pytest.LogCaptureFixture,
) -> None:
    # TG-645: si el limitador falla (Redis caigut) l'operació continua i es registra
    post = await post_repo.create(
        Post.create(event_id=EVENT_ID, author=AUTHOR, text="Text original")
    )
    limiter.fails = True

    with caplog.at_level(logging.WARNING, logger="app.application.posts.post_service"):
        updated = await service.update_post(
            post_id=post.id, author_id=AUTHOR_ID, new_text="Editat"
        )
        await service.delete_post(post_id=post.id, author_id=AUTHOR_ID)

    assert updated.text == "Editat"
    assert post.id not in post_repo.posts
    warnings = [
        r
        for r in caplog.records
        if r.name == "app.application.posts.post_service"
        and r.levelno == logging.WARNING
    ]
    assert len(warnings) == 2


async def test_tg645_create_and_list_do_not_use_the_limiter(
    service: PostService, limiter: FakeRateLimiter
) -> None:
    # TG-645: el límit només aplica a PATCH i DELETE
    limiter.allowed = False

    await service.create_post(event_id=EVENT_ID, author=AUTHOR, text="Hola")
    page = await service.list_posts(event_id=EVENT_ID)

    assert len(page.posts) == 1
    assert limiter.hits == []
