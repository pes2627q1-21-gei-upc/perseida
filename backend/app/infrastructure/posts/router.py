import uuid
from typing import Annotated, Any, Self

from fastapi import APIRouter, Query, Response, status
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.domain.posts.errors import (
    POST_FORBIDDEN,
    POST_MAX_LENGTH,
    POST_NOT_FOUND,
    POST_TEXT_EMPTY,
    POST_TEXT_TOO_LONG,
)
from app.domain.posts.models import Post, PostAuthor
from app.domain.users.models import User
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.posts.dependencies import PostServiceDep
from app.infrastructure.users.dependencies import UserServiceDep

# Community text posts under an event (TG-628). Every endpoint needs a session.
router = APIRouter(tags=["posts"])


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": ProblemDetails,
        "description": description,
        "content": PROBLEM_CONTENT,
    }


_SESSION_ERRORS: dict[int | str, dict[str, Any]] = {
    401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
    403: _problem(
        f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    503: _problem(f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`)."),
}
_UNREADABLE_BODY = _problem(
    "El cos de la petició no es pot llegir (codificació no vàlida)."
)
_EVENT_NOT_FOUND = _problem("L'esdeveniment no existeix (`EVENT_NOT_FOUND`).")
_INVALID_TEXT = (
    f"Text buit (`{POST_TEXT_EMPTY}`), de més de {POST_MAX_LENGTH} caràcters "
    f"(`{POST_TEXT_TOO_LONG}`) o cos mal format (`VALIDATION_ERROR`)."
)
_NOT_AUTHOR = (
    f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`), "
    f"o la publicació no és de la usuària de la sessió (`{POST_FORBIDDEN}`)."
)
_POST_ERRORS: dict[int | str, dict[str, Any]] = {
    **_SESSION_ERRORS,
    403: _problem(_NOT_AUTHOR),
    404: _problem(f"La publicació no existeix (`{POST_NOT_FOUND}`)."),
}


class PostTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(
        ...,
        description=(
            f"Text pla de la publicació: d'1 a {POST_MAX_LENGTH} caràcters un cop "
            "retallats els blancs dels extrems. Mai s'interpreta com a HTML."
        ),
    )


class PostAuthorResponse(BaseModel):
    id: uuid.UUID = Field(..., description="Identificador de l'autora")
    name: str = Field(..., description="Nom visible de l'autora")


class PostResponse(BaseModel):
    id: uuid.UUID = Field(..., description="Identificador de la publicació")
    author: PostAuthorResponse
    text: str = Field(..., description="Text pla; el client no l'ha de renderitzar")
    created_at: AwareDatetime
    edited_at: AwareDatetime | None = Field(
        ..., description="Última edició; `null` si no s'ha editat mai"
    )

    @classmethod
    def build(cls, post: Post) -> Self:
        return cls(
            id=post.id,
            author=PostAuthorResponse(id=post.author.id, name=post.author.name),
            text=post.text,
            created_at=post.created_at,
            edited_at=post.edited_at,
        )


class PostPageResponse(BaseModel):
    items: list[PostResponse] = Field(..., description="De la més nova a la més antiga")
    next_cursor: str | None = Field(
        ..., description="Cursor opac de la pàgina següent; `null` si no n'hi ha més"
    )


def _author(user: User) -> PostAuthor:
    return PostAuthor(id=user.id, name=user.display_name or user.email)


@router.post(
    "/events/{event_id}/posts",
    operation_id="create_event_post",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publica un text en un esdeveniment",
    description="Crea una publicació de text de la usuària de la sessió.",
    response_description="La publicació creada.",
    responses={
        **_SESSION_ERRORS,
        400: _UNREADABLE_BODY,
        404: _EVENT_NOT_FOUND,
        422: _problem(_INVALID_TEXT),
    },
)
async def create_event_post(
    event_id: uuid.UUID,
    body: PostTextRequest,
    session: CurrentSessionDep,
    users: UserServiceDep,
    posts: PostServiceDep,
) -> PostResponse:
    """Crea una publicació a l'esdeveniment."""
    user = await users.get_profile(session.sub)
    post = await posts.create_post(event_id, _author(user), body.text)
    return PostResponse.build(post)


@router.get(
    "/events/{event_id}/posts",
    operation_id="list_event_posts",
    response_model=PostPageResponse,
    status_code=status.HTTP_200_OK,
    summary="Publicacions d'un esdeveniment",
    description=(
        "Llista les publicacions de l'esdeveniment, de la més nova a la més "
        "antiga, paginades per cursor: per a la pàgina següent, envia "
        "`next_cursor` com a `cursor`."
    ),
    response_description="Una pàgina de publicacions.",
    responses={
        **_SESSION_ERRORS,
        404: _EVENT_NOT_FOUND,
        422: _problem(
            "Cursor invàlid (`INVALID_CURSOR`) o `limit` fora de rang "
            "(`VALIDATION_ERROR`)."
        ),
    },
)
async def list_event_posts(
    event_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    posts: PostServiceDep,
    cursor: Annotated[
        str | None,
        Query(max_length=256, description="`next_cursor` de la pàgina anterior"),
    ] = None,
    limit: Annotated[
        int, Query(ge=1, le=50, description="Publicacions per pàgina")
    ] = 20,
) -> PostPageResponse:
    """Llista una pàgina de publicacions de l'esdeveniment."""
    await users.get_profile(session.sub)
    page = await posts.list_posts(event_id, cursor=cursor, limit=limit)
    return PostPageResponse(
        items=[PostResponse.build(p) for p in page.posts],
        next_cursor=page.next_cursor,
    )


@router.patch(
    "/posts/{post_id}",
    operation_id="update_post",
    response_model=PostResponse,
    status_code=status.HTTP_200_OK,
    summary="Edita una publicació pròpia",
    description="Substitueix el text i desa `edited_at`. Només ho pot fer l'autora.",
    response_description="La publicació editada.",
    responses={
        **_POST_ERRORS,
        400: _UNREADABLE_BODY,
        422: _problem(_INVALID_TEXT),
    },
)
async def update_post(
    post_id: uuid.UUID,
    body: PostTextRequest,
    session: CurrentSessionDep,
    users: UserServiceDep,
    posts: PostServiceDep,
) -> PostResponse:
    """Edita el text d'una publicació de la usuària."""
    user = await users.get_profile(session.sub)
    post = await posts.update_post(post_id, user.id, body.text)
    return PostResponse.build(post)


@router.delete(
    "/posts/{post_id}",
    operation_id="delete_post",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Esborra una publicació pròpia",
    description="Esborra la publicació. Només ho pot fer l'autora.",
    response_description="Publicació esborrada.",
    response_class=Response,
    responses=_POST_ERRORS,
)
async def delete_post(
    post_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    posts: PostServiceDep,
) -> None:
    """Esborra una publicació de la usuària."""
    user = await users.get_profile(session.sub)
    await posts.delete_post(post_id, user.id)
