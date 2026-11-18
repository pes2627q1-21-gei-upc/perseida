from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.events.event_service import EventService
from app.application.events.subscription_service import SubscriptionService
from app.infrastructure.cache.dependencies import CacheDep
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.events.subscription_repository import (
    SqlEventSubscriptionRepository,
)


def get_event_service(conn: HTTPConnection, cache: CacheDep) -> EventService:
    # Light objects over the lifespan resources (engine, sources, Redis).
    state = conn.app.state
    return EventService(
        SqlEventRepository(state.session_factory), state.event_sources, cache
    )


EventServiceDep = Annotated[EventService, Depends(get_event_service)]


def get_subscription_service(conn: HTTPConnection) -> SubscriptionService:
    # Light objects over the engine's session factory, owned by the lifespan.
    session_factory = conn.app.state.session_factory
    return SubscriptionService(
        SqlEventRepository(session_factory),
        SqlEventSubscriptionRepository(session_factory),
    )


SubscriptionServiceDep = Annotated[
    SubscriptionService, Depends(get_subscription_service)
]
