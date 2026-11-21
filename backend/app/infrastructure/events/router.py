import json
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.domain.events.models import (
    DEFAULT_RADIUS_KM,
    DEFAULT_RANGE_DAYS,
    MAX_RADIUS_KM,
    MAX_RANGE_DAYS,
    MIN_RADIUS_KM,
    AstronomicalEvent,
    EventCategory,
)
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
    # Sent by the proxy, not the API (infra/nginx-proxy-manager/rate-limit.conf).
    429: {
        "model": ProblemDetails,
        "description": (
            "Massa peticions (code `RATE_LIMITED`): més de 600 per minut entre tots "
            "els clients (comptador compartit), amb una ràfega de 100. La capçalera "
            "`Retry-After` indica quants segons cal esperar."
        ),
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
    "",
    operation_id="list_events",
    response_model=list[EventResponse],
    summary="Llistat d'esdeveniments filtrable",
    description=(
        "Retorna els esdeveniments que estan en curs en algun moment entre els "
        "dies `from` i `to` (dies UTC, `to` inclòs fins a les 24:00Z). Per "
        f"defecte `from` és avui i `to` és {DEFAULT_RANGE_DAYS} dies després de "
        f"`from`; el rang no pot passar de {MAX_RANGE_DAYS} dies. `category` es "
        "pot repetir per demanar-ne diverses; sense cap, totes. Amb `lat` i "
        "`lon` només hi surten els esdeveniments a menys de `radius_km` "
        f"quilòmetres (per defecte {DEFAULT_RADIUS_KM:g}) i els que no tenen "
        "ubicació, que es veuen des de qualsevol lloc. `from` posterior a `to`, "
        f"un rang de més de {MAX_RANGE_DAYS} dies, `lat` sense `lon` (o al "
        "revés) o `radius_km` sense coordenades donen 422. "
        "Endpoint públic, sense autenticació. Resposta: array ordenat per "
        "`starts_at` i després per `id`; buit si no n'hi ha cap."
    )
    + _EXAMPLE,
    response_description="Els esdeveniments que compleixen els filtres.",
    responses=_RESPONSES,
)
async def list_events(
    service: EventServiceDep,
    categories: Annotated[
        list[EventCategory],
        Query(
            alias="category",
            default_factory=list,
            description="Categoria; es pot repetir. Per defecte, totes.",
            openapi_examples={"moon_and_launches": {"value": ["lunar", "launch"]}},
        ),
    ],
    from_day: Annotated[
        IsoDate | None,
        Query(
            alias="from",
            description="Primer dia UTC (YYYY-MM-DD). Per defecte, avui.",
            openapi_examples={"december": {"value": "2026-12-01"}},
        ),
    ] = None,
    to_day: Annotated[
        IsoDate | None,
        Query(
            alias="to",
            description=(
                f"Darrer dia UTC, inclòs (YYYY-MM-DD). Per defecte, "
                f"{DEFAULT_RANGE_DAYS} dies després de `from`."
            ),
            openapi_examples={"december": {"value": "2026-12-31"}},
        ),
    ] = None,
    lat: Annotated[
        float | None,
        Query(
            ge=-90,
            le=90,
            description="Latitud en graus (WGS 84); cal amb `lon`.",
            openapi_examples={"barcelona": {"value": 41.3874}},
        ),
    ] = None,
    lon: Annotated[
        float | None,
        Query(
            ge=-180,
            le=180,
            description="Longitud en graus (WGS 84); cal amb `lat`.",
            openapi_examples={"barcelona": {"value": 2.1686}},
        ),
    ] = None,
    radius_km: Annotated[
        float | None,
        Query(
            ge=MIN_RADIUS_KM,
            le=MAX_RADIUS_KM,
            description=(
                f"Radi en km ({MIN_RADIUS_KM:g}-{MAX_RADIUS_KM:g}) al voltant de "
                f"`lat` i `lon`. Per defecte, {DEFAULT_RADIUS_KM:g}."
            ),
            openapi_examples={"region": {"value": 100}},
        ),
    ] = None,
) -> list[EventResponse]:
    events = await service.search(
        from_day=from_day,
        to_day=to_day,
        categories=categories,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
    )
    return _to_response(events)


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
