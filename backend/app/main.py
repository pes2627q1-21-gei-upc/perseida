from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.api.correlation import CorrelationIdMiddleware
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.api.openapi import install_openapi_cleanup
from app.infrastructure.api.security_headers import SecurityHeadersMiddleware
from app.infrastructure.apod.config import NasaSettings
from app.infrastructure.apod.router import router as apod_router
from app.infrastructure.auth.config import AuthSettings
from app.infrastructure.auth.dependencies import build_auth_service
from app.infrastructure.auth.router import router as auth_router
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.events.config import EventsSettings
from app.infrastructure.events.launch_library import LaunchLibraryEventSource
from app.infrastructure.events.router import router as events_router
from app.infrastructure.health.router import router as health_router
from app.infrastructure.logging import configure_logging
from app.infrastructure.persistence import models  # noqa: F401  (naming convention)
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.realtime.config import RealtimeSettings
from app.infrastructure.realtime.router import router as realtime_router
from app.infrastructure.scheduler.dependencies import (
    get_job_scheduler,
    get_scheduler_settings,
)
from app.infrastructure.scheduler.jobs import register_jobs
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
                ):
                    # One instance per process: it enforces the LL2 quota.
                    app.state.event_sources = [
                        LaunchLibraryEventSource(
                            events_http, events_settings.launch_library_url
                        )
                    ]
                    app.state.nasa_http = nasa_http
                    app.state.nasa_api_key = nasa_settings.nasa_api_key
                    app.state.nasa_timeout_seconds = nasa_timeout
                    app.state.nasa_apod_feed_url = nasa_settings.nasa_apod_feed_url
                    app.state.nasa_apod_api_url = nasa_settings.nasa_apod_api_url
                    try:
                        if scheduler:
                            register_jobs(scheduler)
                            scheduler.start()
                        yield
                    finally:
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
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    register_error_handlers(app)
    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.include_router(health_router, prefix="/api")
    app.include_router(apod_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(users_router, prefix="/api")
    app.include_router(realtime_router, prefix="/api")
    app.include_router(events_router, prefix="/api")
    install_openapi_cleanup(app)
    return app


app = create_app()
