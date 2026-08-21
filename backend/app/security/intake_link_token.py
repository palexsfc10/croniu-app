"""Versioned HMAC tokens for organization intake (student-invite) links.

Same construction as app.security.portal_token — a deterministic HMAC of
the row id, so the same public link can be reconstructed identically at
any time without ever persisting the raw secret — but with its own
version prefix ("l1") and a domain-separated MAC payload. This keeps an
intake-link token structurally and cryptographically distinct from a
client-portal token (app.security.portal_token): neither verifier will
accept the other's tokens, even though both reuse the same signing key.

Format: l1.{link_id_hex}.{mac_b64url}
Payload MAC: HMAC-SHA256(key, b"l1|intake-link|{uuid}").
Key: reuses CLIENT_PORTAL_SIGNING_KEY via get_portal_signing_key() —
already required and validated in HML/production, so no new secret needs
to be configured. The key itself is only ever used server-side to compute
a digest; it is never included in any response, schema, or log line.

Legacy intake links (random raw token + token_hash, issued before this
scheme existed) keep validating exactly as before — see
app.services.intake._resolve_active_link_by_token. This module only adds
a second, always-reconstructable way to reach the same active row.
Nothing about an existing link is rotated or invalidated by introducing
it.
"""

from __future__ import annotations

import binascii
import hashlib
import hmac
import re
import uuid
from base64 import urlsafe_b64decode, urlsafe_b64encode

from app.security.portal_token import get_portal_signing_key

TOKEN_VERSION = "l1"
_SIGNED_RE = re.compile(r"^l1\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$")


class InvalidIntakeLinkToken(Exception):
    """Token presented in signed format but not authentic."""


def mint_intake_link_token(link_id: uuid.UUID, *, key: bytes | None = None) -> str:
    signing_key = key if key is not None else get_portal_signing_key()
    digest = _mac(link_id, signing_key)
    mac = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return f"{TOKEN_VERSION}.{link_id.hex}.{mac}"


def parse_intake_link_token(token: str, *, key: bytes | None = None) -> uuid.UUID | None:
    """Return the link id for a valid signed token.

    None = not in signed format (caller may try the legacy hash lookup).
    Raises InvalidIntakeLinkToken if the value looks signed but is not
    authentic (wrong MAC, tampered id, etc.).
    """
    raw = (token or "").strip()
    if not raw.startswith(f"{TOKEN_VERSION}."):
        return None
    match = _SIGNED_RE.fullmatch(raw)
    if match is None:
        raise InvalidIntakeLinkToken
    try:
        link_id = uuid.UUID(hex=match.group(1))
    except ValueError as exc:
        raise InvalidIntakeLinkToken from exc
    try:
        presented = _b64url_decode(match.group(2))
    except (ValueError, binascii.Error) as exc:
        raise InvalidIntakeLinkToken from exc
    if len(presented) != 32:
        raise InvalidIntakeLinkToken
    expected = _mac(link_id, key if key is not None else get_portal_signing_key())
    if not hmac.compare_digest(presented, expected):
        raise InvalidIntakeLinkToken
    return link_id


def _mac(link_id: uuid.UUID, key: bytes) -> bytes:
    payload = f"{TOKEN_VERSION}|intake-link|{link_id}".encode()
    return hmac.new(key, payload, hashlib.sha256).digest()


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return urlsafe_b64decode(value + padding)
