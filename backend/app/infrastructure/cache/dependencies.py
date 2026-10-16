from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.domain.shared.ports import Cache
from app.infrastructure.cache.redis_cache import RedisCache


def get_cache(conn: HTTPConnection) -> Cache:
    state = conn.app.state
    return RedisCache(state.redis, state.cache_default_ttl_seconds)


CacheDep = Annotated[Cache, Depends(get_cache)]
