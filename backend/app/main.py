from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Aquí es creen els recursos amb cicle de vida (ADR-0017).
    yield


def create_app() -> FastAPI:
    return FastAPI(title="Perseida API", lifespan=lifespan)


app = create_app()
