import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest

from app.application.auth.errors import INVALID_SESSION
from app.application.shared.errors import UnauthorizedError
from app.domain.auth.models import SessionClaims, TokenType
from app.infrastructure.auth.jwt_codec import JwtTokenCodec

SECRET = "s" * 64  # HS512 (a test case) needs 64 bytes; HS256 needs 32
# PyJWT checks ``exp`` against the real clock, so "now" must be real (but fixed).
NOW = datetime.now(UTC).replace(microsecond=0)
CLAIMS = SessionClaims(
    sub="google-123",
    jti="jti-1",
    type=TokenType.ACCESS,
    exp=NOW + timedelta(hours=1),
)


def make_codec() -> JwtTokenCodec:
    return JwtTokenCodec(SECRET, now=lambda: NOW)


def payload(**changes: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "sub": "google-123",
        "jti": "jti-1",
        "type": "access",
        "iat": NOW,
        "exp": NOW + timedelta(hours=1),
    }
    base.update(changes)
    return {key: value for key, value in base.items() if value is not None}


def b64(obj: dict[str, Any]) -> str:
    raw = json.dumps(obj, default=lambda d: int(d.timestamp())).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def unsigned(data: dict[str, Any]) -> str:
    return f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(data)}."


def test_decode_returns_the_claims_that_were_encoded() -> None:
    codec = make_codec()

    assert codec.decode(codec.encode(CLAIMS)) == CLAIMS


def test_the_token_carries_sub_jti_type_iat_and_exp() -> None:
    token = make_codec().encode(CLAIMS)

    decoded = jwt.decode(token, SECRET, algorithms=["HS256"])

    assert decoded == {
        "sub": "google-123",
        "jti": "jti-1",
        "type": "access",
        "iat": int(NOW.timestamp()),
        "exp": int(CLAIMS.exp.timestamp()),
    }


def test_a_tampered_token_is_rejected() -> None:
    header, body, signature = make_codec().encode(CLAIMS).split(".")
    forged_body = b64(payload(sub="someone-else"))

    with pytest.raises(UnauthorizedError) as exc_info:
        make_codec().decode(f"{header}.{forged_body}.{signature}")

    assert exc_info.value.code == INVALID_SESSION


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(
            jwt.encode(
                payload(exp=datetime.now(UTC) - timedelta(hours=1)),
                SECRET,
                algorithm="HS256",
            ),
            id="expired",
        ),
        pytest.param(
            jwt.encode(payload(), "o" * 64, algorithm="HS256"), id="other-secret"
        ),
        pytest.param(unsigned(payload()), id="alg-none"),
        pytest.param(
            jwt.encode(payload(), SECRET, algorithm="HS512"), id="other-algorithm"
        ),
        pytest.param(
            jwt.encode(payload(exp=None), SECRET, algorithm="HS256"), id="no-exp"
        ),
        pytest.param(
            jwt.encode(payload(jti=None), SECRET, algorithm="HS256"), id="no-jti"
        ),
        pytest.param(
            jwt.encode(payload(type="other"), SECRET, algorithm="HS256"),
            id="unknown-type",
        ),
        pytest.param("not-a-jwt", id="garbage"),
    ],
)
def test_an_invalid_token_is_an_invalid_session(token: str) -> None:
    with pytest.raises(UnauthorizedError) as exc_info:
        make_codec().decode(token)

    assert exc_info.value.code == INVALID_SESSION
