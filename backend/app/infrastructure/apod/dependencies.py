from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.application.apod.apod_service import ApodService
from app.domain.apod.ports import ApodProvider
from app.infrastructure.apod.provisional_provider import ProvisionalApodProvider


@lru_cache
def get_apod_provider() -> ApodProvider:
    # TG-46 swaps this body for the real adapter; nothing else changes.
    return ProvisionalApodProvider()


@lru_cache
def get_apod_service() -> ApodService:
    return ApodService(provider=get_apod_provider())


ApodServiceDep = Annotated[ApodService, Depends(get_apod_service)]
