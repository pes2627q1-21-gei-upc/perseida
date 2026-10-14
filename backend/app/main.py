from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.infrastructure.api.correlation import CorrelationIdMiddleware
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.health.router import router as health_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Aquí es creen els recursos amb cicle de vida (ADR-0017).
    yield


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
