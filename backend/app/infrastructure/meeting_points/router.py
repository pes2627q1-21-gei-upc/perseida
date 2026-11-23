from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.meeting_points.errors import MEETING_POINTS_UNAVAILABLE
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.domain.meeting_points.models import MeetingPointProfile
from app.domain.shared.location import Location
from app.infrastructure.api.schemas import PROBLEM_CONTENT, ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.meeting_points.dependencies import MeetingPointServiceDep
from app.infrastructure.meeting_points.schemas import MeetingPointResponse
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(prefix="/meeting-points", tags=["meeting-points"])

# Meeting points recommended from the Spotwise spaces (TG-352). Needs a session.


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": ProblemDetails,
        "description": description,
        "content": PROBLEM_CONTENT,
    }


_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
    403: _problem(
        f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    422: _problem("Paràmetre invàlid (`VALIDATION_ERROR`)."),
    503: _problem(
        f"Spotwise no respon o falla (`{MEETING_POINTS_UNAVAILABLE}`), o no es pot "
        f"comprovar la sessió (`{SESSION_UNAVAILABLE}`)."
    ),
}


@router.get(
    "",
    operation_id="list_meeting_points",
    response_model=list[MeetingPointResponse],
    summary="Punts de trobada recomanats",
    description=(
        "Espais de Spotwise a prop de la ubicació (arrodonida a 3 decimals) que "
        "encaixen amb el perfil: `watch_party` (apte per a grups, amb wifi) o "
        "`study` (silenciós; amb endolls, si n'hi ha), a 1.500 m com a màxim. "
        "En l'ordre de Spotwise; la resposta es desa 5 minuts."
    ),
    response_description="Els espais recomanats; buit si no n'hi ha cap.",
    responses=_RESPONSES,
)
async def list_meeting_points(
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: MeetingPointServiceDep,
    profile: Annotated[
        MeetingPointProfile, Query(description="Per a què és la trobada.")
    ],
    lat: Annotated[
        float, Query(ge=-90, le=90, description="Latitud de la usuària (WGS 84).")
    ],
    lon: Annotated[
        float, Query(ge=-180, le=180, description="Longitud de la usuària (WGS 84).")
    ],
) -> list[MeetingPointResponse]:
    await users.get_profile(session.sub)
    spaces = await service.recommend(profile, Location(latitude=lat, longitude=lon))
    return [MeetingPointResponse.of(space) for space in spaces]
