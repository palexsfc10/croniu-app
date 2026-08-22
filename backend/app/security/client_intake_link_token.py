"""Versioned HMAC tokens for a client-bound (contextual) intake invite.

Same deterministic construction as app.security.intake_link_token — an
HMAC over identifiers, so the token can be verified without ever storing
it — but the payload binds *two* ids: the organization's existing intake
link row and the specific client the invite was issued for. No new
column or table is needed: the client binding lives entirely inside the
signed token, cryptographically tamper-proof, and is re-validated
(link active, client belongs to the same organization, client not
archived) on every use. Nothing about the underlying
OrganizationIntakeLink row changes — the same active link is reused for
every contextual invite in the organization, exactly as it is for the
generic "Convidar aluno" invite.

Format: ci1.{link_id_hex}.{client_id_hex}.{mac_b64url}
Payload MAC: HMAC-SHA256(key, b"ci1|client-intake-link|{link_id}|{client_id}").
Key: reuses CLIENT_PORTAL_SIGNING_KEY via get_portal_signing_key(), same as
app.security.intake_link_token — no new secret to configure.

Domain-separated from both portal_token ("v1") and intake_link_token
("l1"): neither of those verifiers accepts a "ci1." token and vice versa,
even though all three reuse the same signing key.
"""

from __future__ import annotations

import binascii
import hashlib
import hmac
import re
import uuid
from base64 import urlsafe_b64decode, urlsafe_b64encode

from app.security.portal_token import get_portal_signing_key

TOKEN_VERSION = "ci1"
_SIGNED_RE = re.compile(
    r"^ci1\.([0-9a-f]{32})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$"
)


class InvalidClientIntakeLinkToken(Exception):
    """Token presented in signed format but not authentic."""


def mint_client_intake_link_token(
    link_id: uuid.UUID, client_id: uuid.UUID, *, key: bytes | None = None
) -> str:
    signing_key = key if key is not None else get_portal_signing_key()
    digest = _mac(link_id, client_id, signing_key)
    mac = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return f"{TOKEN_VERSION}.{link_id.hex}.{client_id.hex}.{mac}"


def parse_client_intake_link_token(
    token: str, *, key: bytes | None = None
) -> tuple[uuid.UUID, uuid.UUID] | None:
    """Return (link_id, client_id) for a valid signed token.

    None = not in signed format (caller may try another scheme).
    Raises InvalidClientIntakeLinkToken if the value looks signed but is
    not authentic (wrong MAC, tampered id, etc.) — this is what rejects a
    client_id an attacker tries to swap in.
    """
    raw = (token or "").strip()
    if not raw.startswith(f"{TOKEN_VERSION}."):
        return None
    match = _SIGNED_RE.fullmatch(raw)
    if match is None:
        raise InvalidClientIntakeLinkToken
    try:
        link_id = uuid.UUID(hex=match.group(1))
        client_id = uuid.UUID(hex=match.group(2))
    except ValueError as exc:
        raise InvalidClientIntakeLinkToken from exc
    try:
        presented = _b64url_decode(match.group(3))
    except (ValueError, binascii.Error) as exc:
        raise InvalidClientIntakeLinkToken from exc
    if len(presented) != 32:
        raise InvalidClientIntakeLinkToken
    expected = _mac(link_id, client_id, key if key is not None else get_portal_signing_key())
    if not hmac.compare_digest(presented, expected):
        raise InvalidClientIntakeLinkToken
    return link_id, client_id


def _mac(link_id: uuid.UUID, client_id: uuid.UUID, key: bytes) -> bytes:
    payload = f"{TOKEN_VERSION}|client-intake-link|{link_id}|{client_id}".encode()
    return hmac.new(key, payload, hashlib.sha256).digest()


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return urlsafe_b64decode(value + padding)
