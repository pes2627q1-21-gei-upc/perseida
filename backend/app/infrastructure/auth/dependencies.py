from typing import Annotated

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from starlette.requests import HTTPConnection

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
from app.application.shared.errors import UnauthorizedError
from app.application.users.user_service import UserService
from app.domain.auth.models import SessionClaims
from app.infrastructure.auth.config import AuthSettings
from app.infrastructure.auth.google_verifier import GoogleJwksVerifier
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.users.account_gateway import UserAccountGateway

SECONDS_PER_MINUTE = 60
SECONDS_PER_DAY = 24 * 60 * 60


def build_auth_service(
    settings: AuthSettings,
    redis: Redis,
    client: httpx.AsyncClient,
    users: UserService,
) -> AuthService:
    """Wire the auth service; called once from the lifespan, which owns the clients."""
    return AuthService(
        verifier=GoogleJwksVerifier(client, settings.google_client_id),
        codec=JwtTokenCodec(settings.jwt_secret),
        store=RedisSessionStore(redis),
        accounts=UserAccountGateway(users),
        durations=SessionDurations(
            access_seconds=settings.access_token_minutes * SECONDS_PER_MINUTE,
            refresh_seconds=settings.refresh_token_days * SECONDS_PER_DAY,
        ),
    )


def get_auth_service(conn: HTTPConnection) -> AuthService:
    # The service is built in the lifespan because it needs the Redis and HTTP
    # clients (ADR-0017) and the verifier keeps Google's keys in memory.
    service: AuthService = conn.app.state.auth_service
    return service


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]

# auto_error=False: a missing header must answer our own 401 (RFC 9457), not
# FastAPI's default. The scheme still adds the "Authorize" button to /docs.
BEARER = HTTPBearer(auto_error=False, description="Access token (Bearer)")


async def get_current_session(
    service: AuthServiceDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(BEARER)],
) -> SessionClaims:
    if credentials is None:
        raise UnauthorizedError(INVALID_SESSION)
    return await service.authenticate(credentials.credentials)


CurrentSessionDep = Annotated[SessionClaims, Depends(get_current_session)]
