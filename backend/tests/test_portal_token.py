"""Unit tests for reconstructable HMAC portal tokens."""

from __future__ import annotations

import hashlib
import hmac
import uuid

import pytest
from app.security.portal_token import (
    InvalidPortalToken,
    get_portal_signing_key,
    looks_like_bare_uuid,
    mint_portal_token,
    parse_portal_token,
)


def test_mint_and_parse_roundtrip():
    access_id = uuid.uuid4()
    token = mint_portal_token(access_id)
    assert token.startswith("v1.")
    assert parse_portal_token(token) == access_id


def test_tampered_mac_rejected():
    token = mint_portal_token(uuid.uuid4())
    # Don't flip the very last character: the mac is base64url of a 32-byte
    # digest, whose final base64 group encodes only 2 real bytes (16 bits)
    # across 3 characters — the last character's bottom 2 bits are unused
    # padding that the decoder ignores. Roughly 1 in 16 replacement values
    # would then decode to the exact same bytes, making this test flake.
    # The second-to-last character has no such padding bits, so tampering
    # it always changes the decoded MAC.
    idx = len(token) - 2
    tampered = token[:idx] + ("A" if token[idx] != "A" else "B") + token[idx + 1 :]
    with pytest.raises(InvalidPortalToken):
        parse_portal_token(tampered)


def test_bare_uuid_is_not_signed_format():
    bare = str(uuid.uuid4())
    assert looks_like_bare_uuid(bare)
    assert parse_portal_token(bare) is None
    assert looks_like_bare_uuid(uuid.uuid4().hex)
    assert parse_portal_token(uuid.uuid4().hex) is None


def test_unsigned_v1_prefix_rejected():
    access_id = uuid.uuid4()
    with pytest.raises(InvalidPortalToken):
        parse_portal_token(f"v1.{access_id.hex}.not-a-real-mac")


def test_key_domain_separated_from_secret():
    from app.config import get_settings

    secret = get_settings().secret_key.encode("utf-8")
    derived = get_portal_signing_key()
    assert derived != secret
    access_id = uuid.uuid4()
    with_secret = hmac.new(secret, f"v1|{access_id}".encode(), hashlib.sha256).digest()
    with_derived = hmac.new(derived, f"v1|{access_id}".encode(), hashlib.sha256).digest()
    assert with_secret != with_derived


def test_legacy_opaque_string_not_parsed_as_signed():
    assert parse_portal_token("a" * 43) is None


def test_production_like_requires_dedicated_key(monkeypatch):
    monkeypatch.setenv("CRONIU_ENV", "hml")
    monkeypatch.delenv("CLIENT_PORTAL_SIGNING_KEY", raising=False)
    from app.config import Settings

    settings = Settings()
    with pytest.raises(ValueError, match="CLIENT_PORTAL_SIGNING_KEY"):
        settings.validate_client_portal_signing_key()
    with pytest.raises(RuntimeError, match="CLIENT_PORTAL_SIGNING_KEY"):
        get_portal_signing_key(settings)
