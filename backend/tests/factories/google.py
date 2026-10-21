"""Google ID tokens signed with a throwaway RSA key, for tests."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

CLIENT_ID = "app.apps.googleusercontent.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwk(key: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    data = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    return {**data, "kid": kid, "alg": "RS256", "use": "sig"}


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
