from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.events.event_service import EventService
from app.infrastructure.events.repository import SqlEventRepository


def get_event_service(conn: HTTPConnection) -> EventService:
    # Light objects over the engine created in the lifespan.
    return EventService(SqlEventRepository(conn.app.state.session_factory))


EventServiceDep = Annotated[EventService, Depends(get_event_service)]
