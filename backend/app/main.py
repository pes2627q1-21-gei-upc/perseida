
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.health.router import router as health_router
from app.infrastructure.persistence.config import DatabaseSettings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = DatabaseSettings()
    engine = create_async_engine(settings.database_url)
    app.state.session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    try:
        yield
    finally:
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
    app.include_router(health_router, prefix="/api")
    return app


app = create_app()
