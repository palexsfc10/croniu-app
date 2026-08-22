"""Prevent duplicate clients when a manually-created student later completes
the public intake form — contextual (client-bound) invites and the
identifier-based safety net on generic invites.

See app.security.client_intake_link_token and
app.services.intake.{create_client_intake_link,_find_confident_match,
_resolve_link_and_client_by_token, submit_intake}.
"""

from __future__ import annotations

import uuid

from app.security.client_intake_link_token import mint_client_intake_link_token
from fastapi.testclient import TestClient


def _auth(client: TestClient, payload: dict) -> None:
    body = dict(payload)
    body["profession_code"] = "personal_trainer"
    assert client.post("/api/v1/auth/register", json=body).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _required_consents() -> dict[str, bool]:
    return {
        "purpose_science": True,
        "sensitive_health": True,
        "self_declared": True,
        "not_medical": True,
        "privacy_policy": True,
        "whatsapp_optional": False,
    }


def _minimal_answers() -> dict:
    return {
        "a_primary_goal": "Condicionamento",
        "d_chest_pain": "nao",
        "d_dizziness": "nao",
        "g_chest_pain_exertion": "nao",
        "g_dizziness_exertion": "nao",
    }


def _create_manual_client(
    client: TestClient, *, full_name: str, phone: str | None = None, email: str | None = None
) -> dict:
    res = client.post(
        "/api/v1/clients",
        json={"full_name": full_name, "phone": phone, "email": email, "notes": None},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _submit(client: TestClient, token: str, *, full_name: str, phone: str, email: str | None,
            idempotency_key: str, extra: dict | None = None):
    body = {
        "full_name": full_name,
        "phone": phone,
        "email": email,
        "age_band": "18+",
        "primary_goal": "Emagrecimento",
        "answers": _minimal_answers(),
        "consents": _required_consents(),
        "idempotency_key": idempotency_key,
    }
    if extra:
        body.update(extra)
    return client.post(f"/api/v1/public/intake/{token}/submit", json=body)


# --- Contextual (client-bound) invite -------------------------------------


def test_manual_client_then_contextual_invite_completes_same_client(client, register_payload):
    _auth(client, register_payload)
    created = _create_manual_client(
        client, full_name="Sabrina Macedo", phone="11988887777", email="sabrina@example.com"
    )
    client_id = created["id"]

    # Professional opens the ficha before inviting — this lazily creates a
    # journey(stage="active"), the exact pre-existing state that used to
    # collide with journey_svc.create_journey's uniqueness guard once a
    # submission for the same client arrived.
    opened = client.get(f"/api/v1/clients/{client_id}/journey")
    assert opened.status_code == 200
    assert opened.json()["stage"] == "active"

    link = client.post(f"/api/v1/clients/{client_id}/intake-link")
    assert link.status_code == 200, link.text
    link_body = link.json()
    assert link_body["client_id"] == client_id
    assert link_body["token"].startswith("ci1.")
    assert link_body["public_url"].endswith(link_body["public_path"])

    token = link_body["token"]
    ctx = client.get(f"/api/v1/public/intake/{token}")
    assert ctx.status_code == 200
    ctx_body = ctx.json()
    assert ctx_body["prefill_full_name"] == "Sabrina Macedo"
    assert ctx_body["prefill_email"] == "sabrina@example.com"
    assert ctx_body["prefill_phone"] == "11988887777"
    # No other client data (health history, notes, billing, etc.) leaks.
    assert "notes" not in ctx_body
    assert "status" not in ctx_body

    submitted = _submit(
        client,
        token,
        full_name="Sabrina Macedo",
        phone="11988887777",
        email="sabrina@example.com",
        idempotency_key="ctx-sabrina-1",
    )
    assert submitted.status_code == 201, submitted.text
    body = submitted.json()
    assert body["client_id"] == client_id
    assert body["duplicate_alert"] is False

    all_active = client.get("/api/v1/clients?status=active").json()
    assert len(all_active) == 1
    assert all_active[0]["id"] == client_id

    journey = client.get(f"/api/v1/clients/{client_id}/journey").json()
    # Stage is untouched (still "active" — no cycles/evaluations/plan were
    # discarded), but the pending review is now surfaced.
    assert journey["stage"] == "active"
    assert journey["next_action"] == "review_submission"

    submissions = client.get(f"/api/v1/intake-submissions?client_id={client_id}").json()
    assert len(submissions) == 1


def test_contextual_invite_complements_blank_fields_without_overwriting(client, register_payload):
    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Pedro Alves")
    client_id = created["id"]
    assert created["phone"] is None
    assert created["email"] is None

    token = client.post(f"/api/v1/clients/{client_id}/intake-link").json()["token"]
    submitted = _submit(
        client,
        token,
        full_name="Pedro Alves",
        phone="11977776655",
        email="pedro@example.com",
        idempotency_key="ctx-pedro-1",
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["client_id"] == client_id

    after_first = client.get(f"/api/v1/clients/{client_id}").json()
    assert after_first["phone"] == "11977776655"
    assert after_first["email"] == "pedro@example.com"

    # A second contextual invite (e.g. resent) must not let a re-submission
    # silently overwrite data the professional may since have corrected.
    token2 = client.post(f"/api/v1/clients/{client_id}/intake-link").json()["token"]
    resubmitted = _submit(
        client,
        token2,
        full_name="Pedro Alves",
        phone="11900000000",
        email="outro@example.com",
        idempotency_key="ctx-pedro-2",
    )
    assert resubmitted.status_code == 201, resubmitted.text
    assert resubmitted.json()["client_id"] == client_id

    after_second = client.get(f"/api/v1/clients/{client_id}").json()
    assert after_second["phone"] == "11977776655"
    assert after_second["email"] == "pedro@example.com"

    all_active = client.get("/api/v1/clients?status=active").json()
    assert len(all_active) == 1


def test_contextual_invite_reuses_active_link_no_second_link_row(client, register_payload):
    _auth(client, register_payload)
    generic = client.post("/api/v1/intake-link").json()
    created = _create_manual_client(client, full_name="Aluno X", phone="11911112222")
    ctx_link = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()
    # The contextual token embeds the SAME underlying link id as the
    # generic invite — no second OrganizationIntakeLink row is created.
    assert ctx_link["token"].split(".")[1] == generic["id"].replace("-", "")


def test_contextual_link_rejects_archived_client(client, register_payload):
    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Arquivado", phone="11933332222")
    archived = client.patch(f"/api/v1/clients/{created['id']}", json={"status": "archived"})
    assert archived.status_code == 200
    resp = client.post(f"/api/v1/clients/{created['id']}/intake-link")
    assert resp.status_code == 422


def test_contextual_link_404_for_unknown_client(client, register_payload):
    _auth(client, register_payload)
    resp = client.post(f"/api/v1/clients/{uuid.uuid4()}/intake-link")
    assert resp.status_code == 404


def test_contextual_token_rejects_tampered_client_id(client, register_payload):
    _auth(client, register_payload)
    generic = client.post("/api/v1/intake-link")
    link_id = uuid.UUID(generic.json()["id"])
    real_client = _create_manual_client(client, full_name="Real", phone="11955554444")
    other_client_id = uuid.uuid4()  # not a real client at all

    forged = mint_client_intake_link_token(link_id, other_client_id)
    ctx = client.get(f"/api/v1/public/intake/{forged}")
    assert ctx.status_code == 404

    # A syntactically well-formed but re-signed-with-wrong-id token (as if
    # an attacker swapped the client id segment and re-signed with a guessed
    # key) is likewise rejected — covered implicitly since only the real
    # signing key (server-side only) produces a valid MAC. Sanity-check the
    # legitimate token for the real client still works.
    legit = mint_client_intake_link_token(link_id, uuid.UUID(real_client["id"]))
    ok = client.get(f"/api/v1/public/intake/{legit}")
    assert ok.status_code == 200

    # Flipping a character in the MAC (simulating an attacker swapping the
    # client_id segment without knowing the server-side signing key) must
    # be rejected, not silently accepted for a different client.
    head, _, tail = legit.rpartition(".")
    flipped_char = "a" if tail[0] != "a" else "b"
    tampered = f"{head}.{flipped_char}{tail[1:]}"
    tampered_resp = client.get(f"/api/v1/public/intake/{tampered}")
    assert tampered_resp.status_code == 404


def test_contextual_token_rejects_cross_tenant_client(client, register_payload):
    _auth(client, register_payload)
    generic = client.post("/api/v1/intake-link")
    link_id = uuid.UUID(generic.json()["id"])

    other = {
        "email": f"other-dedup-{register_payload['email']}",
        "password": register_payload["password"],
        "full_name": "Other Pro",
        "organization_name": "Other Org Dedup",
        "profession_code": "personal_trainer",
    }
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": other["email"], "password": other["password"]},
        ).status_code
        == 200
    )
    other_client = _create_manual_client(client, full_name="Cliente Outro Org", phone="11999998888")

    # Token pairs org A's link with org B's client — must never resolve.
    forged = mint_client_intake_link_token(link_id, uuid.UUID(other_client["id"]))
    ctx = client.get(f"/api/v1/public/intake/{forged}")
    assert ctx.status_code == 404


def test_contextual_submission_never_leaks_client_id_unsigned(client, register_payload):
    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Sem Assinatura", phone="11922221111")
    # A raw/unsigned client_id can never be used as a token by itself.
    ctx = client.get(f"/api/v1/public/intake/{created['id']}")
    assert ctx.status_code == 404


# --- Generic invite: identifier-based safety net ---------------------------


def test_generic_link_phone_only_match_auto_links(client, register_payload):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    created = _create_manual_client(client, full_name="Só Telefone", phone="11944443333")

    submitted = _submit(
        client, token, full_name="Nome Diferente", phone="11944443333", email=None,
        idempotency_key="phone-only-1",
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["client_id"] == created["id"]
    assert len(client.get("/api/v1/clients").json()) == 1


def test_generic_link_email_only_match_auto_links(client, register_payload):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    created = _create_manual_client(client, full_name="Só Email", email="somente@example.com")

    submitted = _submit(
        client, token, full_name="Outro Nome", phone="11933334444", email="somente@example.com",
        idempotency_key="email-only-1",
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["client_id"] == created["id"]
    assert len(client.get("/api/v1/clients").json()) == 1


def test_generic_link_name_alone_never_auto_links(client, register_payload):
    """Root cause was never the name casing difference — the matcher never
    looks at name at all, only phone/email."""
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    _create_manual_client(client, full_name="Sabrina Macedo", phone="11955556666")

    submitted = _submit(
        client, token, full_name="sabrina macedo", phone="11900001111", email=None,
        idempotency_key="name-only-1",
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["duplicate_alert"] is False
    assert len(client.get("/api/v1/clients").json()) == 2


def test_generic_link_conflicting_identifiers_stay_ambiguous(client, register_payload):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    a = _create_manual_client(client, full_name="Cliente A", phone="11911110000")
    _create_manual_client(client, full_name="Cliente B", email="b@example.com")

    submitted = _submit(
        client, token, full_name="Novo", phone="11911110000", email="b@example.com",
        idempotency_key="conflict-1",
    )
    assert submitted.status_code == 201, submitted.text
    body = submitted.json()
    # Ambiguous: not silently merged into either candidate.
    assert body["client_id"] not in {a["id"]}
    assert body["duplicate_alert"] is True
    assert len(client.get("/api/v1/clients").json()) == 3


def test_generic_link_archived_match_stays_alert_only(client, register_payload):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    created = _create_manual_client(client, full_name="Arquivada", phone="11966660000")
    client.patch(f"/api/v1/clients/{created['id']}", json={"status": "archived"})

    submitted = _submit(
        client, token, full_name="Arquivada", phone="11966660000", email=None,
        idempotency_key="archived-match-1",
    )
    assert submitted.status_code == 201, submitted.text
    body = submitted.json()
    assert body["client_id"] != created["id"]
    assert body["duplicate_alert"] is True
    assert body["archived_match"] is True


def test_generic_link_cross_org_identifiers_never_match(client, register_payload):
    _auth(client, register_payload)
    _create_manual_client(
        client, full_name="Org A", phone="11977770000", email="crosstenant@example.com"
    )

    other = {
        "email": f"other-crosstenant-{register_payload['email']}",
        "password": register_payload["password"],
        "full_name": "Other Pro",
        "organization_name": "Other Org Cross",
        "profession_code": "personal_trainer",
    }
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": other["email"], "password": other["password"]},
        ).status_code
        == 200
    )
    token_b = client.post("/api/v1/intake-link").json()["token"]
    submitted = _submit(
        client, token_b, full_name="Org B Novo", phone="11977770000",
        email="crosstenant@example.com", idempotency_key="cross-org-1",
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["duplicate_alert"] is False
    assert len(client.get("/api/v1/clients").json()) == 1
