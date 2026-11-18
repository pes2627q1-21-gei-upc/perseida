from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.posts.post_service import PostService
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.posts.repository import SqlPostRepository


def get_post_service(conn: HTTPConnection) -> PostService:
    # Light objects over the engine created in the lifespan.
    factory = conn.app.state.session_factory
    return PostService(SqlPostRepository(factory), SqlEventRepository(factory))


PostServiceDep = Annotated[PostService, Depends(get_post_service)]
