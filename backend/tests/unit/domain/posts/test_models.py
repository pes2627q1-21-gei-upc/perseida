import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.posts.errors import (
    POST_MAX_LENGTH,
    POST_TEXT_EMPTY,
    POST_TEXT_TOO_LONG,
)
from app.domain.posts.models import Post, PostAuthor, PostCursor, PostRepositoryPage
from app.domain.shared.errors import ValidationError

EVENT_ID = uuid.uuid7()
AUTHOR_ID = uuid.uuid7()
AUTHOR_NAME = "Estel Observadora"


def _author(name: str = AUTHOR_NAME) -> PostAuthor:
    return PostAuthor(id=AUTHOR_ID, name=name)


def _post(
    text: str = "Hem vist tres meteors brillants!",
    author: PostAuthor | None = None,
) -> Post:
    return Post.create(
        event_id=EVENT_ID,
        author=author or _author(),
        text=text,
    )


# --- Creació i propietats bàsiques (TG-628 criteri 1 i 2) ---


def test_create_post_sets_fields_correctly() -> None:
    # TG-628 criteri 1: publicació associada a esdeveniment i autora
    author = _author()
    post = _post(text="Pluja de lírides espectacular", author=author)

    assert post.event_id == EVENT_ID
    assert post.author.id == AUTHOR_ID
    assert post.author.name == AUTHOR_NAME
    assert post.text == "Pluja de lírides espectacular"
    assert post.edited_at is None
    assert post.id.version == 7


def test_create_post_generates_unique_uuid_v7() -> None:
    p1 = _post()
    p2 = _post()

    assert p1.id != p2.id
    assert p1.id.version == 7
    assert p2.id.version == 7


def test_create_post_sets_created_at_in_utc() -> None:
    before = datetime.now(UTC)
    post = _post()
    after = datetime.now(UTC)

    assert post.created_at.utcoffset() == UTC.utcoffset(None)
    assert before <= post.created_at <= after


# --- Invariants del text (TG-628 criteri 1 i 6, ADR-0024) ---


def test_post_text_strips_surrounding_whitespace() -> None:
    # TG-628 criteri 1: text sense blancs als extrems
    post = _post(text="  Observació clara des del Montsec   \n")
    assert post.text == "Observació clara des del Montsec"


def test_post_text_preserves_internal_newlines_and_tabs() -> None:
    text = "Primera línia\nSegona línia amb \t tabulació"
    post = _post(text=text)
    assert post.text == text


def test_post_text_rejects_empty_string() -> None:
    # TG-628 criteri 1: d'1 a 1000 caràcters
    with pytest.raises(ValidationError) as exc:
        _post(text="")
    assert exc.value.code == POST_TEXT_EMPTY


def test_post_text_rejects_whitespace_only() -> None:
    with pytest.raises(ValidationError) as exc:
        _post(text="   \n\t  ")
    assert exc.value.code == POST_TEXT_EMPTY


def test_post_text_rejects_invisible_characters_only() -> None:
    # ADR-0024: no s'admeten textos només amb caràcters d'amplada zero
    invisible = "\u200b\u200c\u200d\u2060\ufeff"
    with pytest.raises(ValidationError) as exc:
        _post(text=invisible)
    assert exc.value.code == POST_TEXT_EMPTY


def test_post_text_rejects_text_exceeding_max_length() -> None:
    # TG-628 criteri 1: màxim 1.000 caràcters
    too_long = "a" * (POST_MAX_LENGTH + 1)
    with pytest.raises(ValidationError) as exc:
        _post(text=too_long)
    assert exc.value.code == POST_TEXT_TOO_LONG


def test_post_text_accepts_boundary_lengths() -> None:
    min_post = _post(text="x")
    assert len(min_post.text) == 1

    max_text = "b" * POST_MAX_LENGTH
    max_post = _post(text=max_text)
    assert len(max_post.text) == POST_MAX_LENGTH


def test_post_text_drops_dangerous_control_characters_including_nul() -> None:
    # PostgreSQL rebutja bytes NUL (\x00); caràcters de control es purguen
    dirty = "Cometa visible\x00 a simple vista\x07!"
    post = _post(text=dirty)
    assert "\x00" not in post.text
    assert "\x07" not in post.text
    assert post.text == "Cometa visible a simple vista!"


# --- Edició de la publicació (TG-628 criteri 3) ---


def test_post_edit_updates_text_and_sets_edited_at() -> None:
    # TG-628 criteri 3: edita el text i desa edited_at
    post = _post(text="Versió inicial")
    assert post.edited_at is None

    before = datetime.now(UTC)
    updated = post.edit("Versió actualitzada")
    after = datetime.now(UTC)

    # Nova instància immutable
    assert updated is not post
    assert updated.id == post.id
    assert updated.event_id == post.event_id
    assert updated.author == post.author
    assert updated.created_at == post.created_at
    assert updated.text == "Versió actualitzada"
    assert updated.edited_at is not None
    assert before <= updated.edited_at <= after


def test_post_edit_validates_new_text() -> None:
    post = _post(text="Inicial")

    with pytest.raises(ValidationError) as exc:
        post.edit("")
    assert exc.value.code == POST_TEXT_EMPTY

    with pytest.raises(ValidationError) as exc:
        post.edit("z" * (POST_MAX_LENGTH + 1))
    assert exc.value.code == POST_TEXT_TOO_LONG


# --- Immutabilitat dels Value Objects ---


def test_models_are_frozen() -> None:
    post = _post()
    with pytest.raises(PydanticValidationError):
        post.text = "Modificació directa"  # type: ignore[misc]

    author = _author()
    with pytest.raises(PydanticValidationError):
        author.name = "Nom canviat"  # type: ignore[misc]


# --- Cursor i Pàgina del repositori (TG-628 criteri 2) ---


def test_post_cursor_and_page() -> None:
    post = _post()
    cursor = PostCursor(created_at=post.created_at, id=post.id)
    page = PostRepositoryPage(posts=[post], next_cursor=cursor)

    assert page.posts == [post]
    assert page.next_cursor == cursor
