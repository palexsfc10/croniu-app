"""Stable client portal access: signed URL, legacy hash, isolation."""

from __future__ import annotations

import logging
import uuid

from app.models.client_public_access import ClientPublicAccess
from app.security.log_redact import redact_portal_secrets
from app.security.passwords import hash_session_token
from app.security.portal_token import mint_portal_token
from sqlalchemy import func, select
from tests.test_my_cycle_sprint2d import _auth, _seed_cycle


def _me(client):
    return client.get("/api/v1/auth/me").json()


def _insert_legacy(db_session, *, org_id, client_id, raw: str) -> ClientPublicAccess:
    row = ClientPublicAccess(
        id=uuid.uuid4(),
        organization_id=org_id,
        client_id=client_id,
        token_hash=hash_session_token(raw),
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


def test_create_returns_url_and_get_is_stable(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-stable-1")
    created = client.post(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert created.status_code == 200
    body = created.json()
    assert body["has_active_link"] is True
    assert body["token"]
    assert body["public_path"].startswith("/c/v1.")
    assert body["public_url"].endswith(body["public_path"])
    assert body["public_url"] in body["wa_message_template"]

    status = client.get(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert status.status_code == 200
    again = status.json()
    assert again["has_active_link"] is True
    assert again.get("token") is None
    assert again["public_url"] == body["public_url"]
    assert again["public_path"] == body["public_path"]
    assert again["created_at"]
    assert again["last_used_at"] is None
    assert again["wa_message_template"] == body["wa_message_template"]

    repeated = client.get(f"/api/v1/clients/{ids['client_id']}/public-access").json()
    assert repeated["public_url"] == body["public_url"]

    post_again = client.post(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert post_again.status_code == 200
    assert post_again.json()["public_url"] == body["public_url"]
    assert post_again.json()["token"] == body["token"]


def test_copy_get_does_not_rotate_or_create(client, register_payload, db_session):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-no-rotate")
    created = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()
    db_session.expire_all()
    before = db_session.scalar(select(func.count()).select_from(ClientPublicAccess))
    for _ in range(3):
        got = client.get(f"/api/v1/clients/{ids['client_id']}/public-access").json()
        assert got["public_url"] == created["public_url"]
    db_session.expire_all()
    assert db_session.scalar(select(func.count()).select_from(ClientPublicAccess)) == before


def test_signed_link_opens_portal(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-open")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    pub = client.get(f"/api/v1/public/my-cycle/{token}")
    assert pub.status_code == 200
    assert pub.json()["client_first_name"] == "Renata"


def test_legacy_hash_and_signed_url_of_same_row(client, register_payload, db_session):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-legacy")
    me = _me(client)
    org_id = uuid.UUID(me["organization"]["id"])
    client_id = uuid.UUID(ids["client_id"])
    raw = "legacy-opaque-token-value-32chars-min"
    row = _insert_legacy(db_session, org_id=org_id, client_id=client_id, raw=raw)

    assert client.get(f"/api/v1/public/my-cycle/{raw}").status_code == 200

    status = client.get(f"/api/v1/clients/{ids['client_id']}/public-access").json()
    assert status["has_active_link"] is True
    signed = status["public_path"].removeprefix("/c/")
    assert signed.startswith("v1.")
    assert signed != raw
    assert client.get(f"/api/v1/public/my-cycle/{signed}").status_code == 200
    assert mint_portal_token(row.id) == signed
    # GET must not duplicate the row
    db_session.expire_all()
    active = db_session.scalar(
        select(func.count())
        .select_from(ClientPublicAccess)
        .where(
            ClientPublicAccess.client_id == client_id,
            ClientPublicAccess.revoked_at.is_(None),
        )
    )
    assert active == 1
    # legacy still works after minting the signed URL
    assert client.get(f"/api/v1/public/my-cycle/{raw}").status_code == 200


def test_tampered_signature_and_bare_uuid_neutral(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-tamper")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    bad = client.get(f"/api/v1/public/my-cycle/{tampered}")
    assert bad.status_code == 404
    assert bad.json()["message"] == "Este acesso não está disponível."
    assert "token" not in bad.json()["message"].lower()

    bare = str(uuid.uuid4())
    rejected = client.get(f"/api/v1/public/my-cycle/{bare}")
    assert rejected.status_code == 404
    assert rejected.json()["message"] == "Este acesso não está disponível."


def test_rotate_invalidates_signed_and_legacy(client, register_payload, db_session):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-rotate")
    me = _me(client)
    org_id = uuid.UUID(me["organization"]["id"])
    client_id = uuid.UUID(ids["client_id"])
    raw = "legacy-token-to-be-rotated-32charsxx"
    row = _insert_legacy(db_session, org_id=org_id, client_id=client_id, raw=raw)
    signed = mint_portal_token(row.id)
    assert client.get(f"/api/v1/public/my-cycle/{raw}").status_code == 200
    assert client.get(f"/api/v1/public/my-cycle/{signed}").status_code == 200

    rotated = client.post(f"/api/v1/clients/{ids['client_id']}/public-access/rotate")
    assert rotated.status_code == 200
    new_token = rotated.json()["token"]
    assert new_token != signed
    assert client.get(f"/api/v1/public/my-cycle/{raw}").status_code == 404
    assert client.get(f"/api/v1/public/my-cycle/{signed}").status_code == 404
    assert client.get(f"/api/v1/public/my-cycle/{new_token}").status_code == 200


def test_revoke_invalidates_immediately(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-revoke")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    assert client.get(f"/api/v1/public/my-cycle/{token}").status_code == 200
    revoked = client.delete(f"/api/v1/clients/{ids['client_id']}/public-access")
    assert revoked.status_code == 200
    assert revoked.json()["has_active_link"] is False
    assert client.get(f"/api/v1/public/my-cycle/{token}").status_code == 404
    status = client.get(f"/api/v1/clients/{ids['client_id']}/public-access").json()
    assert status["has_active_link"] is False
    assert status.get("public_url") is None


def test_tenant_b_cannot_read_rotate_or_revoke_tenant_a(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-iso-a")
    created = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()
    token = created["token"]
    client.post("/api/v1/auth/logout")
    other = {
        "email": "portal_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio",
    }
    _auth(client, other)
    path = f"/api/v1/clients/{ids['client_id']}/public-access"
    assert client.get(path).status_code == 404
    assert client.post(path).status_code == 404
    assert client.post(f"{path}/rotate").status_code == 404
    assert client.delete(path).status_code == 404
    # original still works
    client.post("/api/v1/auth/logout")
    login = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert login.status_code == 200
    assert client.get(f"/api/v1/public/my-cycle/{token}").status_code == 200


def test_token_and_url_not_in_application_logs(client, register_payload, caplog):
    _auth(client, register_payload)
    ids = _seed_cycle(client, "pa-logs")
    with caplog.at_level(logging.INFO):
        created = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()
        token = created["token"]
        url = created["public_url"]
        client.get(f"/api/v1/clients/{ids['client_id']}/public-access")
        client.get(f"/api/v1/public/my-cycle/{token}")
        client.post(f"/api/v1/clients/{ids['client_id']}/public-access/rotate")
    blob = "\n".join(
        record.getMessage() for record in caplog.records if record.name.startswith("croniu")
    )
    assert token not in blob
    assert url not in blob
    assert "/c/" not in blob
    assert "public/my-cycle/" not in blob


def test_redact_filter_strips_token_from_message():
    token = mint_portal_token(uuid.uuid4())
    raw = f"opened /c/{token} and /api/v1/public/my-cycle/{token}"
    redacted = redact_portal_secrets(raw)
    assert token not in redacted
    assert "/c/[redacted]" in redacted
    assert "/public/my-cycle/[redacted]" in redacted
