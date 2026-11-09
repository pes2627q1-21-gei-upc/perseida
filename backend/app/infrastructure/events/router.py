import json
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.domain.events.models import AstronomicalEvent
from app.infrastructure.api.params import IsoDate
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.events.dependencies import EventServiceDep
from app.infrastructure.events.schemas import EVENT_EXAMPLES, EventResponse

router = APIRouter(prefix="/events", tags=["events"])

# Public endpoints for Spotwise (TG-351); no authentication.

_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ProblemDetails,
        "description": "Paràmetre invàlid (code `VALIDATION_ERROR`).",
        "content": PROBLEM_CONTENT,
    },
    500: {
        "model": ProblemDetails,
        "description": "Error inesperat (code `INTERNAL_ERROR`).",
        "content": PROBLEM_CONTENT,
    },
}


# The example goes in the description: FastAPI drops the nulls of an OpenAPI
# ``example``, and the contract always includes every field.
_EXAMPLE = (
    "\n\nExemple de la forma de cada element (dades fictícies, no la resposta "
    "a uns paràmetres concrets):\n\n```json\n"
    + json.dumps(EVENT_EXAMPLES, indent=2, ensure_ascii=False)
    + "\n```"
)


def _to_response(events: list[AstronomicalEvent]) -> list[EventResponse]:
    return [EventResponse.model_validate(e, from_attributes=True) for e in events]


@router.get(
    "/active",
    operation_id="get_active_events",
    response_model=list[EventResponse],
    summary="Esdeveniments actius en una data",
    description=(
        "Retorna els esdeveniments que estan en curs en algun moment del dia "
        "indicat (dia UTC, de 00:00Z a 24:00Z) o, si no se'n dona cap, d'avui. "
        "Un esdeveniment instantani compta com a actiu el dia en què passa, i un "
        "que acaba just a les 00:00Z també compta aquell dia. "
        "Endpoint públic, sense autenticació. Resposta: array ordenat per "
        "`starts_at` i després per `id`; buit si no n'hi ha cap."
    )
    + _EXAMPLE,
    response_description="Els esdeveniments actius aquell dia.",
    responses=_RESPONSES,
)
async def get_active_events(
    service: EventServiceDep,
    day: Annotated[
        IsoDate | None,
        Query(
            alias="date",
            description="Dia UTC (YYYY-MM-DD). Per defecte, avui.",
            openapi_examples={"full_moon": {"value": "2026-11-24"}},
        ),
    ] = None,
) -> list[EventResponse]:
    return _to_response(await service.active_on(day))


@router.get(
    "/upcoming",
    operation_id="get_upcoming_events",
    response_model=list[EventResponse],
    summary="Esdeveniments que comencen els N dies vinents",
    description=(
        "Retorna els esdeveniments que comencen des d'ara fins d'aquí a `days` "
        "dies; els que ja han començat no hi surten (vegeu "
        "`/api/events/active`). Endpoint públic, sense autenticació. "
        "Resposta: array ordenat per `starts_at` i després per `id`; buit si no "
        "n'hi ha cap."
    )
    + _EXAMPLE,
    response_description="Els esdeveniments que comencen dins la finestra.",
    responses=_RESPONSES,
)
async def get_upcoming_events(
    service: EventServiceDep,
    days: Annotated[
        int,
        Query(
            ge=1,
            le=30,
            description="Nombre de dies vinents (1-30).",
            openapi_examples={"week": {"value": 7}},
        ),
    ] = 7,
) -> list[EventResponse]:
    return _to_response(await service.upcoming(days))
