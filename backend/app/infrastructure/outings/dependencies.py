from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.outings.outing_service import OutingService
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.outings.repository import SqlOutingRepository


def get_outing_service(conn: HTTPConnection) -> OutingService:
    # Light objects over the engine created in the lifespan.
    factory = conn.app.state.session_factory
    return OutingService(SqlOutingRepository(factory), SqlEventRepository(factory))


OutingServiceDep = Annotated[OutingService, Depends(get_outing_service)]
