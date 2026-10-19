import logging
from collections.abc import Awaitable, Callable

from pydantic import TypeAdapter, ValidationError

from app.domain.shared.ports import Cache

logger = logging.getLogger(__name__)


async def get_or_load[T](
    cache: Cache,
    key: str,
    load: Callable[[], Awaitable[T]],
    adapter: TypeAdapter[T],
    ttl_seconds: int | None = None,
) -> T:
    """Return the cached value for ``key``, loading and caching it on a miss.

    ``ttl_seconds`` overrides the cache's default TTL for this key. Errors
    raised by ``load`` propagate and nothing is cached. A cached value that no
    longer validates (e.g. after a model change) is treated as a miss and
    overwritten: nothing in the cache is essential (ADR-0005).
    """
    cached = await cache.get(key)
    if cached is not None:
        try:
            return adapter.validate_json(cached)
        except ValidationError:
            logger.warning("Invalid cached value for %s, reloading", key, exc_info=True)
    value = await load()
    await cache.set(key, adapter.dump_json(value).decode(), ttl_seconds)
    return value
