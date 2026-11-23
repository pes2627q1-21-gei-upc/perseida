import logging
from typing import Annotated

import httpx
from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.meeting_points.meeting_point_service import MeetingPointService
from app.domain.meeting_points.ports import SpaceSearch
from app.infrastructure.cache.dependencies import CacheDep
from app.infrastructure.meeting_points.config import SpotwiseSettings
from app.infrastructure.meeting_points.examples import ExampleSpaceSearch
from app.infrastructure.meeting_points.spotwise_client import SpotwiseSpaceClient

logger = logging.getLogger(__name__)


def build_space_search(
    settings: SpotwiseSettings, http: httpx.AsyncClient
) -> SpaceSearch:
    """Spotwise if a token is configured; otherwise its example answer (mock).

    Called once, in the lifespan: the client keeps the per-process call limit.
    """
    token = settings.spotwise_api_token
    if token is None or not token.get_secret_value():
        logger.warning(
            "SPOTWISE_API_TOKEN is not set: meeting points use the example spaces"
        )
        return ExampleSpaceSearch()
    return SpotwiseSpaceClient(
        http, settings.spotwise_url, token, settings.spotwise_timeout_seconds
    )


def get_meeting_point_service(
    conn: HTTPConnection, cache: CacheDep
) -> MeetingPointService:
    # Light object over the search built in the lifespan and the Redis cache.
    return MeetingPointService(conn.app.state.space_search, cache)


MeetingPointServiceDep = Annotated[
    MeetingPointService, Depends(get_meeting_point_service)
]
