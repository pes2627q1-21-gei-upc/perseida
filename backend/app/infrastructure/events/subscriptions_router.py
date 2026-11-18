import uuid
from typing import Any

from fastapi import APIRouter, Response, status

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.domain.events.errors import EVENT_ALREADY_ENDED, EVENT_NOT_FOUND
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.events.dependencies import SubscriptionServiceDep
from app.infrastructure.events.schemas import EventResponse
from app.infrastructure.users.dependencies import UserServiceDep

# Subscriptions of the user of the session to events (TG-53). Every endpoint
# needs a session.
router = APIRouter(tags=["subscriptions"])


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
_INVALID_EVENT_ID = _problem(
    "Identificador d'esdeveniment invàlid (code `VALIDATION_ERROR`)."
)
# Sent by the proxy, not the API: the /api/events/ block of
# infra/nginx-proxy-manager/rate-limit.conf also covers the subscriptions.
_RATE_LIMITED = _problem(
    "Massa peticions (code `RATE_LIMITED`): més de 600 per minut entre tots "
    "els clients (comptador compartit), amb una ràfega de 100. La capçalera "
    "`Retry-After` indica quants segons cal esperar."
)


@router.put(
    "/events/{event_id}/subscription",
    operation_id="subscribe_to_event",
    status_code=status.HTTP_201_CREATED,
    response_class=Response,
    summary="Subscriu-te a un esdeveniment",
    description=(
        "Subscriu la usuària de la sessió a l'esdeveniment. És idempotent: si ja "
        "hi estava subscrita respon 200 i no canvia res, encara que "
        "l'esdeveniment ja hagi acabat. Una subscripció nova a un esdeveniment "
        "acabat (`ends_at` anterior a ara) es rebutja. Resposta sense cos."
    ),
    response_description="Subscripció creada.",
    responses={
        200: {"description": "Ja hi estaves subscrita; no canvia res."},
        **_SESSION_ERRORS,
        404: _problem(f"L'esdeveniment no existeix (`{EVENT_NOT_FOUND}`)."),
        409: _problem(f"L'esdeveniment ja ha acabat (`{EVENT_ALREADY_ENDED}`)."),
        422: _INVALID_EVENT_ID,
        429: _RATE_LIMITED,
    },
)
async def subscribe_to_event(
    event_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    subscriptions: SubscriptionServiceDep,
) -> Response:
    """Subscriu la usuària a l'esdeveniment."""
    user = await users.get_profile(session.sub)
    created = await subscriptions.subscribe(user.id, event_id)
    return Response(
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK
    )


@router.delete(
    "/events/{event_id}/subscription",
    operation_id="unsubscribe_from_event",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Dona't de baixa d'un esdeveniment",
    description=(
        "Esborra la subscripció de la usuària de la sessió a l'esdeveniment. És "
        "idempotent: respon 204 també si no hi estava subscrita o si "
        "l'esdeveniment no existeix."
    ),
    response_description="Ja no hi estàs subscrita.",
    responses={**_SESSION_ERRORS, 422: _INVALID_EVENT_ID, 429: _RATE_LIMITED},
)
async def unsubscribe_from_event(
    event_id: uuid.UUID,
    session: CurrentSessionDep,
    users: UserServiceDep,
    subscriptions: SubscriptionServiceDep,
) -> None:
    """Dona de baixa la usuària de l'esdeveniment."""
    user = await users.get_profile(session.sub)
    await subscriptions.unsubscribe(user.id, event_id, google_sub=session.sub)


@router.get(
    "/me/subscriptions",
    operation_id="list_my_subscriptions",
    response_model=list[EventResponse],
    status_code=status.HTTP_200_OK,
    summary="Esdeveniments als quals estàs subscrita",
    description=(
        "Retorna els esdeveniments als quals està subscrita la usuària de la "
        "sessió, també els que ja han acabat. Resposta: array ordenat per "
        "`starts_at` i després per `id`; buit si no n'hi ha cap."
    ),
    response_description="Els esdeveniments subscrits.",
    responses=_SESSION_ERRORS,
)
async def list_my_subscriptions(
    session: CurrentSessionDep,
    users: UserServiceDep,
    subscriptions: SubscriptionServiceDep,
) -> list[EventResponse]:
    """Llista els esdeveniments subscrits de la usuària."""
    user = await users.get_profile(session.sub)
    events = await subscriptions.list_mine(user.id)
    return [EventResponse.model_validate(e, from_attributes=True) for e in events]
