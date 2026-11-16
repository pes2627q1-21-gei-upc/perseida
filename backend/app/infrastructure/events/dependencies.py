from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.events.event_service import EventService
from app.infrastructure.cache.dependencies import CacheDep
from app.infrastructure.events.repository import SqlEventRepository


def get_event_service(conn: HTTPConnection, cache: CacheDep) -> EventService:
    # Light objects over the lifespan resources (engine, sources, Redis).
    state = conn.app.state
    return EventService(
        SqlEventRepository(state.session_factory), state.event_sources, cache
    )


EventServiceDep = Annotated[EventService, Depends(get_event_service)]
