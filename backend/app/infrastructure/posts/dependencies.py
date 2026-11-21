from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.posts.post_service import PostService
from app.infrastructure.chat.rate_limiter import RedisSendRateLimiter
from app.infrastructure.events.repository import SqlEventRepository
from app.infrastructure.posts.config import PostsSettings
from app.infrastructure.posts.repository import SqlPostRepository


@lru_cache
def get_posts_settings() -> PostsSettings:
    return PostsSettings()


PostsSettingsDep = Annotated[PostsSettings, Depends(get_posts_settings)]


def get_post_service(conn: HTTPConnection, settings: PostsSettingsDep) -> PostService:
    # Light objects over the lifespan resources (session factory, Redis).
    state = conn.app.state
    return PostService(
        SqlPostRepository(state.session_factory),
        SqlEventRepository(state.session_factory),
        RedisSendRateLimiter(
            state.redis,
            settings.posts_write_rate_limit,
            settings.posts_write_rate_limit_window_seconds,
            key_prefix="posts",
        ),
    )


PostServiceDep = Annotated[PostService, Depends(get_post_service)]
