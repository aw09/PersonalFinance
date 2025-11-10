from __future__ import annotations

import base64
import json
import time
from hashlib import sha256
import hmac
from typing import Any, Mapping, Sequence


class JWTError(Exception):
    """Base class for JWT-related errors."""


class InvalidTokenError(JWTError):
    """Raised when a token cannot be decoded or the signature is invalid."""


class ExpiredSignatureError(JWTError):
    """Raised when a token has expired."""


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(message: bytes, secret: str, algorithm: str) -> bytes:
    if algorithm != "HS256":
        raise InvalidTokenError(f"Unsupported JWT algorithm: {algorithm}")
    return hmac.new(secret.encode("utf-8"), message, sha256).digest()


def encode(payload: Mapping[str, Any], secret: str, algorithm: str = "HS256") -> str:
    header = {"alg": algorithm, "typ": "JWT"}
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
    payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signing_input = f"{header_segment}.{payload_segment}".encode()
    signature = _b64url_encode(_sign(signing_input, secret, algorithm))
    return "".join([header_segment, ".", payload_segment, ".", signature])


def decode(
    token: str,
    secret: str,
    algorithms: Sequence[str] | None = None,
    *,
    verify_exp: bool = True,
) -> dict[str, Any]:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:
        raise InvalidTokenError("Token structure is invalid") from exc

    header_data = json.loads(_b64url_decode(header_segment))
    algorithm = header_data.get("alg")
    if not algorithm:
        raise InvalidTokenError("Token header missing algorithm")
    if algorithms and algorithm not in algorithms:
        raise InvalidTokenError("Token uses an unexpected signing algorithm")

    signing_input = f"{header_segment}.{payload_segment}".encode()
    expected_signature = _sign(signing_input, secret, algorithm)
    received_signature = _b64url_decode(signature_segment)
    if not hmac.compare_digest(expected_signature, received_signature):
        raise InvalidTokenError("Token signature mismatch")

    payload = json.loads(_b64url_decode(payload_segment))
    if verify_exp and "exp" in payload:
        if int(payload["exp"]) < int(time.time()):
            raise ExpiredSignatureError("Token has expired")
    return payload


__all__ = ["encode", "decode", "JWTError", "InvalidTokenError", "ExpiredSignatureError"]
