from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.infrastructure.health.router import router as health_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Aquí es creen els recursos amb cicle de vida (ADR-0017).
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Perseida API", lifespan=lifespan)
    app.include_router(health_router)
    return app


app = create_app()
