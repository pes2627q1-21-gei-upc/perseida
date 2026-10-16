from collections.abc import Awaitable, Callable

from pydantic import TypeAdapter

from app.domain.shared.ports import Cache


async def get_or_load[T](
    cache: Cache,
    key: str,
    load: Callable[[], Awaitable[T]],
    adapter: TypeAdapter[T],
    ttl_seconds: int | None = None,
) -> T:
    """Return the cached value for ``key``, loading and caching it on a miss.

    ``ttl_seconds`` overrides the cache's default TTL for this key. Errors
    raised by ``load`` propagate and nothing is cached.
    """
    cached = await cache.get(key)
    if cached is not None:
        return adapter.validate_json(cached)
    value = await load()
    await cache.set(key, adapter.dump_json(value).decode(), ttl_seconds)
    return value
