from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.apod.apod_service import ApodService
from app.domain.apod.ports import ApodProvider
from app.infrastructure.apod.nasa_client import NasaApodClient
from app.infrastructure.apod.nasa_provider import NasaApodProvider
from app.infrastructure.apod.repository import SqlApodRepository
from app.infrastructure.cache.dependencies import CacheDep


def get_apod_provider(conn: HTTPConnection, cache: CacheDep) -> ApodProvider:
    # Light objects over the lifespan resources (HTTP client, Redis, engine).
    state = conn.app.state
    client = NasaApodClient(
        state.nasa_http, state.nasa_api_key, state.nasa_timeout_seconds
    )
    return NasaApodProvider(
        client=client,
        cache=cache,
        repository=SqlApodRepository(state.session_factory),
    )


def get_apod_service(
    provider: Annotated[ApodProvider, Depends(get_apod_provider)],
) -> ApodService:
    return ApodService(provider=provider)


ApodServiceDep = Annotated[ApodService, Depends(get_apod_service)]
