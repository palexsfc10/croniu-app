"""Regression tests for the student-invite link hotfix.

Covers the root cause fixed here: GET /intake-link must always be able to
reconstruct the same public URL for an active link (deterministic HMAC of
the row id — app.security.intake_link_token), so the professional never
hits a dead end asking them to "create" a link that already exists. Also
covers that pre-fix ("legacy") links, which only ever had a token_hash,
keep validating exactly as before — nothing is migrated or rotated.
"""

from __future__ import annotations

import uuid
from urllib.parse import unquote

from app.models.intake import OrganizationIntakeLink
from app.security.intake_link_token import mint_intake_link_token
from app.security.passwords import generate_session_token, hash_session_token
from fastapi.testclient import TestClient


def _auth(client: TestClient, payload: dict, *, profession: str = "personal_trainer") -> None:
    body = dict(payload)
    body["profession_code"] = profession
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def test_reload_and_relogin_return_the_same_link(client, register_payload):
    _auth(client, register_payload)
    created = client.post("/api/v1/intake-link").json()
    token = created["token"]
    assert token and created["public_url"]

    # "Reload": GET again in the same session.
    reloaded = client.get("/api/v1/intake-link").json()
    assert reloaded["has_active_link"] is True
    assert reloaded["token"] == token
    assert reloaded["public_url"] == created["public_url"]

    # "Logout/login": fresh login, same organization.
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": register_payload["email"], "password": register_payload["password"]},
        ).status_code
        == 200
    )
    again = client.get("/api/v1/intake-link").json()
    assert again["token"] == token


def test_legacy_hash_token_still_resolves_alongside_new_signed_token(
    client, register_payload, db_session
):
    """A link created by the pre-fix code (raw token only ever hashed, never
    persisted) must keep working forever — no forced rotation, no
    invalidation. The dashboard must also be able to show a fresh,
    reusable URL for that same row going forward."""
    _auth(client, register_payload)
    created = client.post("/api/v1/intake-link").json()
    link_id = created["id"]

    # Simulate a row that predates this fix: overwrite its token_hash with
    # a hash of a raw string nobody but "the student" ever saw, exactly
    # like every intake link in production today.
    legacy_raw = generate_session_token()
    row = db_session.get(OrganizationIntakeLink, link_id)
    row.token_hash = hash_session_token(legacy_raw)
    db_session.add(row)
    db_session.commit()

    # The old, already-shared link keeps working untouched.
    legacy_ctx = client.get(f"/api/v1/public/intake/{legacy_raw}")
    assert legacy_ctx.status_code == 200

    # The dashboard can still show a working, reusable link for this same
    # row — reconstructed from the id, nothing stored.
    reusable = client.get("/api/v1/intake-link").json()
    assert reusable["has_active_link"] is True
    signed_ctx = client.get(f"/api/v1/public/intake/{reusable['token']}")
    assert signed_ctx.status_code == 200
    assert (
        signed_ctx.json()["professional_public_name"]
        == legacy_ctx.json()["professional_public_name"]
    )


def test_disabling_link_rejects_its_signed_token_too(client, register_payload):
    _auth(client, register_payload)
    token = client.get("/api/v1/intake-link").json()  # has_active_link False initially
    assert token["has_active_link"] is False
    created = client.post("/api/v1/intake-link").json()
    signed = created["token"]
    assert client.get(f"/api/v1/public/intake/{signed}").status_code == 200

    disabled = client.post("/api/v1/intake-link/disable")
    assert disabled.status_code == 200

    # Signature is still cryptographically valid, but status is the real
    # source of truth for revocation.
    assert client.get(f"/api/v1/public/intake/{signed}").status_code == 404


def test_signed_token_cannot_be_forged_or_reused_across_organizations(client, register_payload):
    _auth(client, register_payload)
    client.post("/api/v1/intake-link")

    # Random id that isn't this (or any) organization's link row.
    forged = mint_intake_link_token(uuid.uuid4())
    assert client.get(f"/api/v1/public/intake/{forged}").status_code == 404

    # Tampering the signature of an otherwise-valid token must fail closed.
    #
    # The MAC is 32 bytes, base64url-encoded without padding: 10 full
    # 4-char/3-byte groups followed by one partial 3-char group covering
    # the last 2 bytes. In a full group every character carries all 6 of
    # its bits as real data, so substituting it for any other character
    # is guaranteed to change the decoded bytes. In the trailing partial
    # group, though, the final character carries only 4 significant bits
    # (the other 2 are padding discarded on decode) — so for some random
    # MACs, swapping just that last character can round-trip to the exact
    # same bytes, leaving the "tampered" token still valid and making
    # this assertion intermittently (and wrongly) fail. Tampering the
    # MAC's *first* character instead keeps it inside a full group, so
    # the corruption is guaranteed regardless of which random token this
    # run generates.
    valid = client.get("/api/v1/intake-link").json()["token"]
    head, mac = valid.rsplit(".", 1)
    tampered_char = "A" if mac[0] != "A" else "B"
    tampered = f"{head}.{tampered_char}{mac[1:]}"
    assert client.get(f"/api/v1/public/intake/{tampered}").status_code == 404


def test_create_intake_link_repeated_calls_reuse_existing_active_link(client, register_payload):
    _auth(client, register_payload)
    first = client.post("/api/v1/intake-link")
    second = client.post("/api/v1/intake-link")
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["token"] == second.json()["token"]

    active = client.get("/api/v1/intake-links").json()
    assert sum(1 for item in active if item["status"] == "active") == 1


def test_whatsapp_and_copy_share_the_exact_same_url(client, register_payload):
    _auth(client, register_payload)
    link = client.post("/api/v1/intake-link").json()
    assert link["public_url"]

    wa_text = unquote(link["wa_message_url"].split("text=", 1)[1])
    assert link["public_url"] in wa_text
    assert wa_text.startswith("Olá! Para facilitar seu acompanhamento")
    assert wa_text.rstrip().endswith(link["public_url"])


def test_no_token_or_signing_material_in_logs(client, register_payload, caplog):
    import logging

    _auth(client, register_payload)
    with caplog.at_level(logging.INFO, logger="croniu.intake"):
        created = client.post("/api/v1/intake-link").json()
        client.get("/api/v1/intake-link")
        client.post("/api/v1/intake-link/rotate")
        client.post("/api/v1/intake-link/disable")

    token = created["token"]
    for record in caplog.records:
        message = record.getMessage()
        assert token not in message
        assert "l1." not in message
