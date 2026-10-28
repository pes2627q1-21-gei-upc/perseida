from unittest.mock import AsyncMock

from pydantic import BaseModel, TypeAdapter

from app.application.shared.cache import get_or_load
from tests.fakes.cache import FakeCache


class Item(BaseModel):
    name: str


ADAPTER = TypeAdapter(Item)


async def test_tg146_miss_calls_the_loader_and_stores_the_value() -> None:
    cache = FakeCache()
    load = AsyncMock(return_value=Item(name="apod"))

    result = await get_or_load(cache, "apod:2026-10-05", load, ADAPTER)

    assert result == Item(name="apod")
    load.assert_awaited_once()
    assert cache.values == {"apod:2026-10-05": '{"name":"apod"}'}


async def test_tg146_hit_returns_the_stored_value_without_the_loader() -> None:
    cache = FakeCache()
    load = AsyncMock(return_value=Item(name="apod"))

    first = await get_or_load(cache, "apod:2026-10-05", load, ADAPTER)
    second = await get_or_load(cache, "apod:2026-10-05", load, ADAPTER)

    assert first == second == Item(name="apod")
    load.assert_awaited_once()


async def test_tg146_ttl_is_passed_to_the_cache_per_key() -> None:
    cache = FakeCache()
    load = AsyncMock(return_value=Item(name="quiz"))

    await get_or_load(cache, "quiz:today", load, ADAPTER, ttl_seconds=30)
    await get_or_load(cache, "apod:today", load, ADAPTER)

    assert cache.ttls == {"quiz:today": 30, "apod:today": None}


async def test_tg146_loads_again_after_the_entry_expires() -> None:
    cache = FakeCache()
    load = AsyncMock(return_value=Item(name="apod"))

    await get_or_load(cache, "apod:today", load, ADAPTER)
    cache.expire("apod:today")
    await get_or_load(cache, "apod:today", load, ADAPTER)

    assert load.await_count == 2


async def test_tg146_empty_cache_is_not_an_error() -> None:
    cache = FakeCache()
    load = AsyncMock(return_value=Item(name="apod"))

    assert await get_or_load(cache, "apod:today", load, ADAPTER) == Item(name="apod")


async def test_tg146_invalid_cached_value_is_a_miss_and_is_overwritten() -> None:
    cache = FakeCache()
    await cache.set("apod:today", '{"title":"old model"}')
    load = AsyncMock(return_value=Item(name="apod"))

    result = await get_or_load(cache, "apod:today", load, ADAPTER)

    assert result == Item(name="apod")
    load.assert_awaited_once()
    assert cache.values == {"apod:today": '{"name":"apod"}'}
