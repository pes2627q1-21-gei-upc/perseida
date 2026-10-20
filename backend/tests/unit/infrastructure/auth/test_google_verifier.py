import base64
import hashlib
import hmac
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.application.auth.errors import (
    IDENTITY_PROVIDER_UNAVAILABLE,
    INVALID_GOOGLE_TOKEN,
)
from app.application.shared.errors import ExternalServiceError, UnauthorizedError
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)

CLIENT_ID = "app.apps.googleusercontent.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
NEW_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwk(key: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    data = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    return {**data, "kid": kid, "alg": "RS256", "use": "sig"}


JWKS = {"keys": [jwk(KEY, "k1")]}
ROTATED_JWKS = {"keys": [jwk(KEY, "k1"), jwk(NEW_KEY, "k2")]}


def claims(**changes: Any) -> dict[str, Any]:
    now = datetime.now(UTC)
    base: dict[str, Any] = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "google-123",
        "email": "ana@example.com",
        "email_verified": True,
        "name": "Ana",
        "picture": "https://example.com/ana.png",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    base.update(changes)
    return {key: value for key, value in base.items() if value is not None}


def token(key: rsa.RSAPrivateKey = KEY, kid: str | None = "k1", **changes: Any) -> str:
    headers = {"kid": kid} if kid else {}
    return jwt.encode(claims(**changes), key, algorithm="RS256", headers=headers)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def hs256_signed_with_the_public_key() -> str:
    """The classic algorithm-confusion forgery, built by hand: PyJWT refuses it."""
    secret = KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": "k1"}).encode())
    body = b64(json.dumps(claims(), default=lambda d: int(d.timestamp())).encode())
    signature = hmac.new(secret, f"{header}.{body}".encode(), hashlib.sha256)
    return f"{header}.{body}.{b64(signature.digest())}"


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
async def verifier(clock: Clock) -> AsyncIterator[GoogleJwksVerifier]:
    async with httpx.AsyncClient() as client:
        yield GoogleJwksVerifier(client, CLIENT_ID, monotonic=clock)


@pytest.fixture
def certs(respx_mock: respx.MockRouter) -> respx.Route:
    return respx_mock.get(GOOGLE_CERTS_URL).respond(json=JWKS)


async def test_a_valid_token_returns_the_identity(
    verifier: GoogleJwksVerifier, certs: respx.Route
) -> None:
    identity = await verifier.verify(token())

    assert identity.google_sub == "google-123"
    assert identity.email == "ana@example.com"
    assert identity.name == "Ana"
    assert identity.picture == "https://example.com/ana.png"


@pytest.mark.parametrize(
    "issuer", ["https://accounts.google.com", "accounts.google.com"]
)
async def test_both_google_issuers_are_accepted(
    verifier: GoogleJwksVerifier, certs: respx.Route, issuer: str
) -> None:
    identity = await verifier.verify(token(iss=issuer))

    assert identity.google_sub == "google-123"


async def test_name_and_picture_are_optional(
    verifier: GoogleJwksVerifier, certs: respx.Route
) -> None:
    identity = await verifier.verify(token(name=None, picture=None))

    assert identity.name is None
    assert identity.picture is None


@pytest.mark.parametrize(
    "bad_token",
    [
        pytest.param(token(exp=datetime.now(UTC) - timedelta(hours=1)), id="expired"),
        pytest.param(token(aud="other-app"), id="other-audience"),
        pytest.param(token(iss="https://evil.example.com"), id="other-issuer"),
        pytest.param(token(email_verified=False), id="email-not-verified"),
        pytest.param(token(email_verified=None), id="email-verified-missing"),
        pytest.param(token(sub=None), id="no-sub"),
        pytest.param(token(email=None), id="no-email"),
        pytest.param(token(key=OTHER_KEY), id="signed-with-another-key"),
        pytest.param(token(kid=None), id="no-kid"),
        pytest.param(token(kid="unknown"), id="unknown-kid"),
        pytest.param(
            hs256_signed_with_the_public_key(), id="hs256-with-the-public-key"
        ),
        pytest.param("not-a-jwt", id="garbage"),
    ],
)
async def test_an_invalid_token_is_rejected(
    verifier: GoogleJwksVerifier, certs: respx.Route, bad_token: str
) -> None:
    with pytest.raises(UnauthorizedError) as exc_info:
        await verifier.verify(bad_token)

    assert exc_info.value.code == INVALID_GOOGLE_TOKEN


async def test_a_tampered_token_is_rejected(
    verifier: GoogleJwksVerifier, certs: respx.Route
) -> None:
    header, _, signature = token().split(".")
    forged = b64(
        json.dumps(
            claims(sub="someone-else"), default=lambda d: int(d.timestamp())
        ).encode()
    )

    with pytest.raises(UnauthorizedError) as exc_info:
        await verifier.verify(f"{header}.{forged}.{signature}")

    assert exc_info.value.code == INVALID_GOOGLE_TOKEN


async def test_keys_are_cached_for_one_hour(
    verifier: GoogleJwksVerifier, certs: respx.Route, clock: Clock
) -> None:
    await verifier.verify(token())
    await verifier.verify(token())
    assert certs.call_count == 1

    clock.now += 3600
    await verifier.verify(token())

    assert certs.call_count == 2


async def test_an_unknown_kid_refreshes_the_keys_once(
    verifier: GoogleJwksVerifier, certs: respx.Route, clock: Clock
) -> None:
    await verifier.verify(token())
    certs.respond(json=ROTATED_JWKS)
    clock.now += 61

    identity = await verifier.verify(token(key=NEW_KEY, kid="k2"))

    assert identity.google_sub == "google-123"
    assert certs.call_count == 2


async def test_unknown_kids_do_not_hit_google_more_than_once_a_minute(
    verifier: GoogleJwksVerifier, certs: respx.Route, clock: Clock
) -> None:
    await verifier.verify(token())

    for _ in range(3):
        with pytest.raises(UnauthorizedError):
            await verifier.verify(token(kid="unknown"))

    assert certs.call_count == 1


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(httpx.ConnectError("down"), id="network-error"),
        pytest.param(httpx.Response(500), id="server-error"),
        pytest.param(httpx.Response(200, text="not json"), id="invalid-json"),
        pytest.param(httpx.Response(200, json={"keys": []}), id="no-keys"),
        pytest.param(
            httpx.Response(
                200,
                json={
                    "keys": [{k: v for k, v in jwk(KEY, "k1").items() if k != "kid"}]
                },
            ),
            id="keys-without-kid",
        ),
    ],
)
async def test_google_down_without_keys_is_unavailable(
    verifier: GoogleJwksVerifier,
    respx_mock: respx.MockRouter,
    failure: httpx.Response | Exception,
) -> None:
    respx_mock.get(GOOGLE_CERTS_URL).mock(
        side_effect=failure if isinstance(failure, Exception) else None,
        return_value=failure if isinstance(failure, httpx.Response) else None,
    )

    with pytest.raises(ExternalServiceError) as exc_info:
        await verifier.verify(token())

    assert exc_info.value.code == IDENTITY_PROVIDER_UNAVAILABLE


async def test_google_down_with_cached_keys_keeps_working(
    verifier: GoogleJwksVerifier, certs: respx.Route, clock: Clock
) -> None:
    await verifier.verify(token())
    certs.respond(500)
    clock.now += 7200

    identity = await verifier.verify(token())

    assert identity.google_sub == "google-123"
