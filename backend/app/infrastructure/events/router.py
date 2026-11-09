from typing import Annotated

from fastapi import APIRouter, Query

from app.domain.events.models import AstronomicalEvent
from app.infrastructure.api.params import IsoDate
from app.infrastructure.events.dependencies import EventServiceDep
from app.infrastructure.events.schemas import EventResponse

router = APIRouter(prefix="/events", tags=["events"])

# Public endpoints for Spotwise (TG-351); no authentication.


def _to_response(events: list[AstronomicalEvent]) -> list[EventResponse]:
    return [EventResponse.model_validate(e, from_attributes=True) for e in events]


@router.get(
    "/active",
    operation_id="get_active_events",
    response_model=list[EventResponse],
    summary="Esdeveniments actius en una data",
)
async def get_active_events(
    service: EventServiceDep,
    day: Annotated[
        IsoDate | None,
        Query(alias="date", description="Dia UTC (YYYY-MM-DD). Per defecte, avui."),
    ] = None,
) -> list[EventResponse]:
    return _to_response(await service.active_on(day))


@router.get(
    "/upcoming",
    operation_id="get_upcoming_events",
    response_model=list[EventResponse],
    summary="Esdeveniments que comencen els N dies vinents",
)
async def get_upcoming_events(
    service: EventServiceDep,
    days: Annotated[
        int, Query(ge=1, le=30, description="Nombre de dies vinents (1-30).")
    ] = 7,
) -> list[EventResponse]:
    return _to_response(await service.upcoming(days))
