from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.api.correlation import CorrelationIdMiddleware
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.health.router import router as health_router
from app.infrastructure.persistence import models  # noqa: F401  (naming convention)
from app.infrastructure.persistence.config import DatabaseSettings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = DatabaseSettings()
    engine = create_async_engine(settings.database_url)
    app.state.session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    redis_settings = RedisSettings()
    redis = Redis.from_url(redis_settings.redis_url, decode_responses=True)
    app.state.redis = redis
    app.state.cache_default_ttl_seconds = redis_settings.cache_default_ttl_seconds
    try:
        yield
    finally:
        await redis.aclose()
        await engine.dispose()


def create_app() -> FastAPI:
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
    app.include_router(health_router, prefix="/api")
    return app


app = create_app()
