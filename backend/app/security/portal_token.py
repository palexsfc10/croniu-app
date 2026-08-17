"""Versioned HMAC tokens for the client public portal.

Reuses stdlib HMAC-SHA256 and hmac.compare_digest (same primitives as Asaas
webhook validation). Not a session token. Not a JWT.

Format: v1.{access_id_hex}.{mac_b64url}

Payload MAC: HMAC-SHA256(key, b"v1|{uuid}").
Key: CLIENT_PORTAL_SIGNING_KEY if set, otherwise HMAC-SHA256(SECRET_KEY,
b"croniu.client-public-access.v1") for domain separation.

Rotating the signing key invalidates previously minted signed URLs immediately.
GET status will mint a new signed URL for the same ClientPublicAccess row.
Legacy token_hash URLs are unaffected by signing-key rotation.
"""

from __future__ import annotations

import binascii
import hashlib
import hmac
import re
import uuid
from base64 import urlsafe_b64decode, urlsafe_b64encode

from app.config import Settings, get_settings

TOKEN_VERSION = "v1"
_KEY_DOMAIN = b"croniu.client-public-access.v1"
_SIGNED_RE = re.compile(r"^v1\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$")
_BARE_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    r"|^[0-9a-fA-F]{32}$"
)


class InvalidPortalToken(Exception):
    """Signed token presented but not authentic."""


def get_portal_signing_key(settings: Settings | None = None) -> bytes:
    cfg = settings or get_settings()
    dedicated = (cfg.client_portal_signing_key or "").strip()
    if dedicated:
        return dedicated.encode("utf-8")
    if cfg.is_production_like:
        raise RuntimeError(
            "CLIENT_PORTAL_SIGNING_KEY is required in HML and production"
        )
    return hmac.new(
        cfg.secret_key.encode("utf-8"),
        _KEY_DOMAIN,
        hashlib.sha256,
    ).digest()


def mint_portal_token(access_id: uuid.UUID, *, key: bytes | None = None) -> str:
    signing_key = key if key is not None else get_portal_signing_key()
    digest = _mac(access_id, signing_key)
    mac = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return f"{TOKEN_VERSION}.{access_id.hex}.{mac}"


def parse_portal_token(token: str, *, key: bytes | None = None) -> uuid.UUID | None:
    """Return access id for a valid signed token.

    None = not in signed format (caller may try legacy hash).
    Raises InvalidPortalToken if the value looks signed but is not authentic.
    """
    raw = (token or "").strip()
    if not raw.startswith(f"{TOKEN_VERSION}."):
        return None
    match = _SIGNED_RE.fullmatch(raw)
    if match is None:
        raise InvalidPortalToken
    try:
        access_id = uuid.UUID(hex=match.group(1))
    except ValueError as exc:
        raise InvalidPortalToken from exc
    try:
        presented = _b64url_decode(match.group(2))
    except (ValueError, binascii.Error) as exc:
        raise InvalidPortalToken from exc
    if len(presented) != 32:
        raise InvalidPortalToken
    expected = _mac(access_id, key if key is not None else get_portal_signing_key())
    if not hmac.compare_digest(presented, expected):
        raise InvalidPortalToken
    return access_id


def looks_like_bare_uuid(token: str) -> bool:
    return bool(_BARE_UUID_RE.fullmatch((token or "").strip()))


def _mac(access_id: uuid.UUID, key: bytes) -> bytes:
    payload = f"{TOKEN_VERSION}|{access_id}".encode()
    return hmac.new(key, payload, hashlib.sha256).digest()


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return urlsafe_b64decode(value + padding)
