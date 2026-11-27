import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.achievements.router import router as achievements_router
from app.infrastructure.api.correlation import CorrelationIdMiddleware
from app.infrastructure.api.cors import add_cors
from app.infrastructure.api.error_handlers import (
    UnexpectedErrorMiddleware,
    register_error_handlers,
)
from app.infrastructure.api.openapi import install_openapi_cleanup
from app.infrastructure.api.security_headers import SecurityHeadersMiddleware
from app.infrastructure.apod.config import NasaSettings
from app.infrastructure.apod.router import router as apod_router
from app.infrastructure.auth.config import AuthSettings
from app.infrastructure.auth.dependencies import build_auth_service
from app.infrastructure.auth.router import router as auth_router
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.chat.router import router as chat_router
from app.infrastructure.direct_chat.broadcaster import DirectMessagePubSubBroadcaster
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.push_notifier import NoopPushNotifier
from app.infrastructure.direct_chat.router import router as direct_chat_router
from app.infrastructure.events.config import EventsSettings
from app.infrastructure.events.launch_library import LaunchLibraryEventSource
from app.infrastructure.events.meteor_catalog import MeteorShowerCatalogSource
from app.infrastructure.events.router import router as events_router
from app.infrastructure.events.skyfield_source import SkyfieldLunarSource
from app.infrastructure.events.subscriptions_router import (
    router as subscriptions_router,
)
from app.infrastructure.events.usno import UsnoSolarEclipseSource
from app.infrastructure.health.dependencies import build_health_service
from app.infrastructure.health.router import router as health_router
from app.infrastructure.logging import configure_logging
from app.infrastructure.meeting_points.config import SpotwiseSettings
from app.infrastructure.meeting_points.dependencies import build_space_search
from app.infrastructure.meeting_points.router import router as meeting_points_router
from app.infrastructure.outings.router import router as outings_router
from app.infrastructure.persistence import models  # noqa: F401  (naming convention)
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.posts.router import router as posts_router
from app.infrastructure.quiz.router import router as quiz_router
from app.infrastructure.realtime.config import RealtimeSettings
from app.infrastructure.realtime.router import router as realtime_router
from app.infrastructure.scheduler.dependencies import (
    get_job_scheduler,
    get_scheduler_settings,
)
from app.infrastructure.scheduler.jobs import register_jobs
from app.infrastructure.streaks.router import router as streaks_router
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.infrastructure.users.router import router as users_router

GOOGLE_HTTP_TIMEOUT_SECONDS = 5.0


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    redis_settings = RedisSettings()
    auth_settings = AuthSettings()
    settings = DatabaseSettings()
    nasa_settings = NasaSettings()
    events_settings = EventsSettings()
    spotwise_settings = SpotwiseSettings()
    scheduler = (
        get_job_scheduler() if get_scheduler_settings().scheduler_enabled else None
    )
    timeout = redis_settings.redis_socket_timeout_seconds
    redis = Redis.from_url(
        redis_settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=timeout,
        socket_timeout=timeout,
    )
    try:
        app.state.redis = redis
        app.state.cache_default_ttl_seconds = redis_settings.cache_default_ttl_seconds
        app.state.realtime_config = RealtimeSettings().config()
        async with httpx.AsyncClient(timeout=GOOGLE_HTTP_TIMEOUT_SECONDS) as client:
            engine = create_async_engine(settings.database_url)
            try:
                session_factory = async_sessionmaker(
                    engine,
                    expire_on_commit=False,
                )
                app.state.session_factory = session_factory
                app.state.health_service = build_health_service(
                    session_factory, redis, scheduler
                )
                user_service = build_user_service(session_factory)
                app.state.user_service = user_service
                app.state.auth_service = build_auth_service(
                    auth_settings, redis, client, UserAccountGateway(user_service)
                )
                nasa_timeout = nasa_settings.nasa_timeout_seconds
                async with (
                    httpx.AsyncClient(
                        timeout=httpx.Timeout(
                            nasa_timeout,
                            connect=nasa_settings.nasa_connect_timeout_seconds,
                        )
                    ) as nasa_http,
                    httpx.AsyncClient(
                        timeout=httpx.Timeout(
                            events_settings.events_timeout_seconds,
                            connect=events_settings.events_connect_timeout_seconds,
                        )
                    ) as events_http,
                    httpx.AsyncClient(
                        timeout=spotwise_settings.spotwise_timeout_seconds
                    ) as spotwise_http,
                ):
                    # Spotwise without a token: its example answer (TG-352).
                    app.state.space_search = build_space_search(
                        spotwise_settings, spotwise_http
                    )
                    # One instance per process: LL2 enforces its quota and
                    # Skyfield loads the ephemeris once (ADR-0031).
                    app.state.event_sources = [
                        LaunchLibraryEventSource(
                            events_http, events_settings.launch_library_url
                        ),
                        UsnoSolarEclipseSource(events_http),
                        SkyfieldLunarSource(),
                        MeteorShowerCatalogSource(),
                    ]
                    app.state.nasa_http = nasa_http
                    app.state.nasa_api_key = nasa_settings.nasa_api_key
                    app.state.nasa_timeout_seconds = nasa_timeout
                    app.state.nasa_apod_feed_url = nasa_settings.nasa_apod_feed_url
                    app.state.nasa_apod_api_url = nasa_settings.nasa_apod_api_url
                    dispatcher = DirectOutboxDispatcher(
                        session_factory,
                        DirectMessagePubSubBroadcaster(
                            RedisPubSub(redis), timeout_seconds=timeout
                        ),
                        NoopPushNotifier(),
                    )
                    outbox_task = asyncio.create_task(dispatcher.run())
                    try:
                        if scheduler:
                            register_jobs(scheduler)
                            scheduler.start()
                        yield
                    finally:
                        outbox_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await outbox_task
                        if scheduler:
                            await scheduler.shutdown()
            finally:
                await engine.dispose()
    finally:
        await redis.aclose()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="Perseida API",
        description="Backend oficial del projecte Perseida - "
        "Arquitectura Hexagonal i API",
        version="0.3.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    register_error_handlers(app)
    # Reverse wrap (Security > Correlation > CORS > errors): preflights get both
    # headers and an unexpected 500 crosses all three (TG-599).
    app.add_middleware(UnexpectedErrorMiddleware)
    add_cors(app)
    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.include_router(health_router, prefix="/api")
    app.include_router(apod_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(users_router, prefix="/api")
    app.include_router(realtime_router, prefix="/api")
    app.include_router(events_router, prefix="/api")
    app.include_router(subscriptions_router, prefix="/api")
    app.include_router(quiz_router, prefix="/api")
    app.include_router(streaks_router, prefix="/api")
    app.include_router(achievements_router, prefix="/api")
    app.include_router(outings_router, prefix="/api")
    app.include_router(posts_router, prefix="/api")
    app.include_router(chat_router, prefix="/api")
    app.include_router(direct_chat_router, prefix="/api")
    app.include_router(meeting_points_router, prefix="/api")
    install_openapi_cleanup(app)
    return app


app = create_app()
