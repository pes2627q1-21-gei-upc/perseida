from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.apod.apod_activity_service import ApodActivityService
from app.application.apod.apod_service import ApodService
from app.domain.apod.ports import ApodProvider
from app.infrastructure.apod.activity_registrar import UserStreakActivityRegistrar
from app.infrastructure.apod.nasa_client import NasaApodClient
from app.infrastructure.apod.nasa_feed_client import NasaApodFeedClient
from app.infrastructure.apod.nasa_provider import NasaApodProvider
from app.infrastructure.apod.repository import SqlApodRepository
from app.infrastructure.cache.dependencies import CacheDep
from app.infrastructure.streaks.dependencies import StreakServiceDep
from app.infrastructure.users.dependencies import UserServiceDep


def get_apod_provider(conn: HTTPConnection, cache: CacheDep) -> ApodProvider:
    # Light objects over the lifespan resources (HTTP client, Redis, engine).
    state = conn.app.state
    client = NasaApodClient(
        state.nasa_http,
        state.nasa_api_key,
        state.nasa_timeout_seconds,
        state.nasa_apod_api_url,
    )
    feed_client = NasaApodFeedClient(
        state.nasa_http, state.nasa_timeout_seconds, state.nasa_apod_feed_url
    )
    return NasaApodProvider(
        client=client,
        feed_client=feed_client,
        cache=cache,
        repository=SqlApodRepository(state.session_factory),
    )


def get_apod_service(
    provider: Annotated[ApodProvider, Depends(get_apod_provider)],
) -> ApodService:
    return ApodService(provider=provider)


ApodServiceDep = Annotated[ApodService, Depends(get_apod_service)]


def get_apod_activity_service(
    users: UserServiceDep, streaks: StreakServiceDep
) -> ApodActivityService:
    return ApodActivityService(UserStreakActivityRegistrar(users, streaks))


ApodActivityServiceDep = Annotated[
    ApodActivityService, Depends(get_apod_activity_service)
]
