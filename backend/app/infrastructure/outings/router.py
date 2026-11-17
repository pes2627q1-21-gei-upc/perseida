import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request, Response, status

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.domain.outings.errors import (
    OUTING_DESCRIPTION_TOO_LONG,
    OUTING_ENDS_BEFORE_START,
    OUTING_EVENT_NOT_FOUND,
    OUTING_FORBIDDEN,
    OUTING_NOT_FOUND,
    OUTING_STARTS_IN_PAST,
    OUTING_TITLE_EMPTY,
    OUTING_TITLE_TOO_LONG,
)
from app.domain.outings.models import OutingChanges
from app.domain.shared.location import Location
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.outings.dependencies import OutingServiceDep
from app.infrastructure.outings.schemas import (
    OutingCreate,
    OutingResponse,
    OutingUpdate,
)
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(prefix="/outings", tags=["outings"])

# Observation outings created by users (TG-629). Every endpoint needs a session.


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": ProblemDetails,
        "description": description,
        "content": PROBLEM_CONTENT,
    }


_SESSION: dict[int | str, dict[str, Any]] = {
    401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
    403: _problem(
        f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    503: _problem(f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`)."),
}
_INVALID = _problem(
    "Dades no vàlides: `VALIDATION_ERROR` (format) o "
    f"`{OUTING_TITLE_EMPTY}`, `{OUTING_TITLE_TOO_LONG}`, "
    f"`{OUTING_DESCRIPTION_TOO_LONG}`, `{OUTING_ENDS_BEFORE_START}`, "
    f"`{OUTING_STARTS_IN_PAST}` o `{OUTING_EVENT_NOT_FOUND}`."
)
_NOT_FOUND = _problem(f"La sortida no existeix (`{OUTING_NOT_FOUND}`).")
_UNREADABLE = _problem("El cos de la petició no es pot llegir (codificació no vàlida).")
_NOT_AUTHOR = _problem(
    f"No ets l'autora de la sortida (`{OUTING_FORBIDDEN}`), o el compte és suspès "
    f"(`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
)

OutingId = Annotated[uuid.UUID, Path(description="Identificador de la sortida")]


@router.post(
    "",
    operation_id="create_outing",
    response_model=OutingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una sortida d'observació",
    description=(
        "Crea una sortida de la usuària de la sessió. L'esdeveniment relacionat "
        "és opcional; si se'n dona un, ha d'existir. La capçalera `Location` "
        "porta la URL de la sortida creada."
    ),
    response_description="La sortida creada, amb l'autora.",
    responses={**_SESSION, 400: _UNREADABLE, 422: _INVALID},
)
async def create_outing(
    payload: OutingCreate,
    request: Request,
    response: Response,
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: OutingServiceDep,
) -> OutingResponse:
    user = await users.get_profile(session.sub)
    details = await service.create(
        user.id,
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        location=Location.model_validate(payload.location.model_dump()),
        event_id=payload.event_id,
    )
    response.headers["Location"] = str(
        request.app.url_path_for("get_outing", outing_id=str(details.outing.id))
    )
    return OutingResponse.of(details)


@router.get(
    "",
    operation_id="list_outings",
    response_model=list[OutingResponse],
    summary="Sortides que encara no han començat",
    description=(
        "Retorna les sortides amb l'inici a partir d'ara, ordenades per `starts_at` "
        "i després per `id`. Es poden filtrar per esdeveniment (`event_id`) i "
        "quedar-se només amb les de la usuària de la sessió (`mine=true`)."
    ),
    response_description="Les sortides futures; buit si no n'hi ha cap.",
    responses={**_SESSION, 422: _problem("Paràmetre invàlid (`VALIDATION_ERROR`).")},
)
async def list_outings(
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: OutingServiceDep,
    event_id: Annotated[
        uuid.UUID | None,
        Query(description="Només les sortides d'aquest esdeveniment."),
    ] = None,
    mine: Annotated[
        bool, Query(description="Només les sortides de la usuària de la sessió.")
    ] = False,
) -> list[OutingResponse]:
    user = await users.get_profile(session.sub)
    outings = await service.list_upcoming(
        event_id=event_id, author_id=user.id if mine else None
    )
    return [OutingResponse.of(details) for details in outings]


@router.get(
    "/{outing_id}",
    operation_id="get_outing",
    response_model=OutingResponse,
    summary="Detall d'una sortida",
    description="Retorna la sortida amb l'autora.",
    response_description="La sortida.",
    responses={
        **_SESSION,
        404: _NOT_FOUND,
        422: _problem("Identificador mal format (`VALIDATION_ERROR`)."),
    },
)
async def get_outing(
    outing_id: OutingId,
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: OutingServiceDep,
) -> OutingResponse:
    await users.get_profile(session.sub)
    return OutingResponse.of(await service.get(outing_id))


@router.patch(
    "/{outing_id}",
    operation_id="update_outing",
    response_model=OutingResponse,
    summary="Edita una sortida",
    description=(
        "Només l'autora. Canvien només els camps enviats; `event_id: null` treu "
        "l'esdeveniment. Si canvien `starts_at` o `ends_at`, l'inici no pot ser en "
        "el passat; si no, es pot editar una sortida que ja ha començat."
    ),
    response_description="La sortida editada.",
    responses={
        **_SESSION,
        400: _UNREADABLE,
        403: _NOT_AUTHOR,
        404: _NOT_FOUND,
        422: _INVALID,
    },
)
async def update_outing(
    outing_id: OutingId,
    payload: OutingUpdate,
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: OutingServiceDep,
) -> OutingResponse:
    user = await users.get_profile(session.sub)
    changes = OutingChanges.model_validate(payload.model_dump(exclude_unset=True))
    return OutingResponse.of(await service.update(user.id, outing_id, changes))


@router.delete(
    "/{outing_id}",
    operation_id="delete_outing",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Esborra una sortida",
    description="Només l'autora.",
    response_description="La sortida s'ha esborrat.",
    responses={
        **_SESSION,
        403: _NOT_AUTHOR,
        404: _NOT_FOUND,
        422: _problem("Identificador mal format (`VALIDATION_ERROR`)."),
    },
)
async def delete_outing(
    outing_id: OutingId,
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: OutingServiceDep,
) -> None:
    user = await users.get_profile(session.sub)
    await service.delete(user.id, outing_id)
