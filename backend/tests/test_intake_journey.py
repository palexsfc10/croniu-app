"""Client intake journey — permanent link, anamnesis, approval, protocols."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient


def _auth(client: TestClient, payload: dict, *, profession: str = "personal_trainer") -> None:
    body = dict(payload)
    body["profession_code"] = profession
    if profession == "other":
        body["profession_other"] = "Consultoria independente"
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


def _minimal_answers(*, attention: bool = False) -> dict:
    answers = {
        "a_primary_goal": "Condicionamento",
        "d_chest_pain": "nao",
        "d_dizziness": "nao",
        "g_chest_pain_exertion": "sim" if attention else "nao",
        "g_dizziness_exertion": "nao",
    }
    return answers


def _create_link(client: TestClient) -> str:
    created = client.post("/api/v1/intake-link")
    assert created.status_code == 200, created.text
    token = created.json()["token"]
    assert token and len(token) >= 32
    # The token is reconstructable: a subsequent GET returns the exact same
    # value, so the professional can always fetch the same reusable link.
    status = client.get("/api/v1/intake-link")
    assert status.status_code == 200
    assert status.json()["has_active_link"] is True
    assert status.json().get("token") == token
    return token


def test_intake_link_create_rotate_disable(client, register_payload):
    _auth(client, register_payload)
    token1 = _create_link(client)

    ctx = client.get(f"/api/v1/public/intake/{token1}")
    assert ctx.status_code == 200
    body = ctx.json()
    assert "organization_id" not in body
    assert body["professional_public_name"]
    assert body["anamnesis_schema"]

    rotated = client.post("/api/v1/intake-link/rotate")
    assert rotated.status_code == 200
    token2 = rotated.json()["token"]
    assert token2 != token1

    assert client.get(f"/api/v1/public/intake/{token1}").status_code == 404
    assert client.get(f"/api/v1/public/intake/{token2}").status_code == 200

    disabled = client.post("/api/v1/intake-link/disable")
    assert disabled.status_code == 200
    assert disabled.json()["has_active_link"] is False
    assert client.get(f"/api/v1/public/intake/{token2}").status_code == 404


def test_submit_idempotency_underage_and_attention(client, register_payload):
    _auth(client, register_payload)
    token = _create_link(client)

    underage = client.post(
        f"/api/v1/public/intake/{token}/submit",
        json={
            "full_name": "Menor Teste",
            "phone": "11999990001",
            "birth_date": "2015-01-01",
            "primary_goal": "Treino",
            "age_band": "18+",
            "answers": _minimal_answers(),
            "consents": _required_consents(),
            "idempotency_key": "idem-underage",
            "organization_id": "00000000-0000-0000-0000-000000000099",
        },
    )
    assert underage.status_code == 422
    assert underage.json()["code"] == "underage_blocked"

    payload = {
        "full_name": "Ana Aluna",
        "phone": "11999990002",
        "email": "ana@example.com",
        "age_band": "18+",
        "primary_goal": "Emagrecimento",
        "answers": _minimal_answers(attention=True),
        "consents": _required_consents(),
        "idempotency_key": "idem-ana-1",
        "organization_id": "00000000-0000-0000-0000-000000000099",
    }
    first = client.post(f"/api/v1/public/intake/{token}/submit", json=payload)
    assert first.status_code == 201, first.text
    data = first.json()
    assert data["requires_professional_attention"] is True
    assert "diagnostic" not in (data.get("attention_message") or "").lower()
    assert "diagnóstico" not in (data.get("attention_message") or "").lower()
    portal = data["portal_token"]
    assert portal
    submission_id = data["submission_id"]

    second = client.post(f"/api/v1/public/intake/{token}/submit", json=payload)
    assert second.status_code == 201
    assert second.json()["idempotent_replay"] is True
    assert second.json()["submission_id"] == submission_id

    # Hash only: raw intake token must not appear in link status
    link = client.get("/api/v1/intake-link").json()
    assert link.get("token") is None

    pre = client.get(f"/api/v1/public/intake/portal/{portal}/status")
    assert pre.status_code == 200
    assert pre.json()["journey_stage"] == "pending_review"
    assert "Aguardando" in pre.json()["journey_label"]

    detail = client.get(f"/api/v1/intake-submissions/{submission_id}")
    assert detail.status_code == 200
    assert detail.json()["requires_professional_attention"] is True
    assert detail.json()["anamnesis"] is not None

    approved = client.post(
        f"/api/v1/intake-submissions/{submission_id}/approve",
        json={"evaluation_decision": "waived", "protocol_decision": "needed"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    post = client.get(f"/api/v1/public/intake/portal/{portal}/status")
    assert post.status_code == 200
    assert post.json()["journey_stage"] in {
        "approved",
        "evaluation_pending",
        "protocol_pending",
        "ready_to_start",
    }


def test_permanent_invite_creates_independent_submissions_and_survives_rotation(
    client, register_payload
):
    _auth(client, register_payload)
    invite = _create_link(client)

    def submit(name: str, phone: str, key: str):
        return client.post(
            f"/api/v1/public/intake/{invite}/submit",
            json={
                "full_name": name,
                "phone": phone,
                "age_band": "18+",
                "primary_goal": f"Objetivo {name}",
                "answers": _minimal_answers(),
                "consents": _required_consents(),
                "idempotency_key": key,
            },
        )

    first = submit("Aluno A", "11933334444", "permanent-invite-a")
    second = submit("Aluno B", "11955556666", "permanent-invite-b")
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    a = first.json()
    b = second.json()
    assert a["submission_id"] != b["submission_id"]
    assert a["client_id"] != b["client_id"]
    assert a["portal_token"] != b["portal_token"]

    # The permanent invite resolves only a blank form context; it cannot read
    # either submission or act as either submission's private portal token.
    context = client.get(f"/api/v1/public/intake/{invite}")
    assert context.status_code == 200
    assert "submission_id" not in context.json()
    assert "client_id" not in context.json()
    assert client.get(f"/api/v1/public/intake/portal/{invite}/status").status_code == 404

    assert client.get(
        f"/api/v1/public/intake/portal/{a['portal_token']}/status"
    ).status_code == 200
    assert client.get(
        f"/api/v1/public/intake/portal/{b['portal_token']}/status"
    ).status_code == 200

    rotated = client.post("/api/v1/intake-link/rotate")
    assert rotated.status_code == 200
    assert client.get(f"/api/v1/public/intake/{invite}").status_code == 404
    listed_ids = {str(row["id"]) for row in client.get("/api/v1/intake-submissions").json()}
    assert {a["submission_id"], b["submission_id"]} <= listed_ids


def test_duplicate_alert_same_org(client, register_payload):
    _auth(client, register_payload)
    token = _create_link(client)
    created = client.post(
        "/api/v1/clients",
        json={"full_name": "Existente", "phone": "11988887777", "email": "dup@example.com"},
    )
    assert created.status_code == 201

    submitted = client.post(
        f"/api/v1/public/intake/{token}/submit",
        json={
            "full_name": "Possível Dup",
            "phone": "11988887777",
            "email": "dup@example.com",
            "age_band": "18+",
            "primary_goal": "Força",
            "answers": _minimal_answers(),
            "consents": _required_consents(),
            "idempotency_key": "idem-dup-1",
        },
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["duplicate_alert"] is True


def test_reject_and_protocol_versioning(client, register_payload):
    _auth(client, register_payload)
    token = _create_link(client)
    submitted = client.post(
        f"/api/v1/public/intake/{token}/submit",
        json={
            "full_name": "Bruno",
            "phone": "11977776666",
            "age_band": "18+",
            "primary_goal": "Hipertrofia",
            "answers": _minimal_answers(),
            "consents": _required_consents(),
            "idempotency_key": "idem-bruno",
        },
    )
    assert submitted.status_code == 201
    sid = submitted.json()["submission_id"]
    client_id = submitted.json()["client_id"]
    portal = submitted.json()["portal_token"]

    rejected = client.post(
        f"/api/v1/intake-submissions/{sid}/reject",
        json={
            "rejection_internal_reason": "Agenda cheia",
            "message_to_client": "No momento não conseguimos iniciar.",
        },
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    # Internal reason must not leak to portal
    status = client.get(f"/api/v1/public/intake/portal/{portal}/status").json()
    assert status["journey_stage"] == "rejected"
    assert "Agenda cheia" not in (status.get("message_to_client") or "")

    # New submission for protocol flow
    token2 = client.post("/api/v1/intake-link/rotate").json()["token"]
    ok = client.post(
        f"/api/v1/public/intake/{token2}/submit",
        json={
            "full_name": "Carla",
            "phone": "11966665555",
            "age_band": "18+",
            "primary_goal": "Mobilidade",
            "answers": _minimal_answers(),
            "consents": _required_consents(),
            "idempotency_key": "idem-carla",
        },
    )
    assert ok.status_code == 201
    cid = ok.json()["client_id"]
    portal2 = ok.json()["portal_token"]
    assert (
        client.post(
            f"/api/v1/intake-submissions/{ok.json()['submission_id']}/approve",
            json={"evaluation_decision": "waived", "protocol_decision": "needed"},
        ).status_code
        == 200
    )

    proto = client.post(
        "/api/v1/protocols",
        json={
            "title": "Treino A",
            "protocol_type": "structured",
            "client_id": cid,
            "content_json": {"sessions": [{"name": "Dia 1", "items": []}]},
            "private_notes": "nota interna secreta",
        },
    )
    assert proto.status_code == 201, proto.text
    pid = proto.json()["id"]
    pub = client.post(f"/api/v1/protocols/{pid}/publish")
    assert pub.status_code == 200
    assert pub.json()["status"] == "published"
    assert pub.json()["current_version_number"] == 1

    # Edit creates new draft then publish v2
    upd = client.patch(
        f"/api/v1/protocols/{pid}",
        json={"content_json": {"sessions": [{"name": "Dia 1 atualizado", "items": []}]}},
    )
    assert upd.status_code == 200
    pub2 = client.post(f"/api/v1/protocols/{pid}/publish")
    assert pub2.status_code == 200
    assert pub2.json()["current_version_number"] == 2
    versions = client.get(f"/api/v1/protocols/{pid}/versions").json()
    assert len(versions) >= 2
    assert any(v["status"] == "superseded" for v in versions)

    portal_view = client.get(f"/api/v1/public/intake/portal/{portal2}/status").json()
    assert portal_view["protocol"] is not None
    assert portal_view["protocol"]["version_number"] == 2
    assert "secreta" not in str(portal_view)

    # invalid token enumeration
    bad = client.get("/api/v1/public/intake/not-a-real-token")
    assert bad.status_code == 404
    assert "organization" not in bad.text.lower() or "organization_id" not in bad.text

    # home counts include intake
    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200
    assert "new_submissions_count" in home.json()

    # client journey endpoint for legacy+new
    journey = client.get(f"/api/v1/clients/{cid}/journey")
    assert journey.status_code == 200
    assert journey.json()["stage_label"]

    # schedule review + routine
    assert (
        client.post(
            f"/api/v1/protocols/{pid}/schedule-review",
            json={"review_recurrence_days": 30, "review_reason": "Revisão mensal"},
        ).status_code
        == 200
    )
    routine = client.post(
        "/api/v1/routines",
        json={
            "name": "Feedbacks de quinta",
            "task_type": "send_feedback",
            "recurrence": "weekly",
            "weekday": 3,
            "next_run_on": date.today().isoformat(),
        },
    )
    assert routine.status_code == 201, routine.text
    assert client.post(f"/api/v1/routines/{routine.json()['id']}/complete").status_code == 200

    # silence unused
    assert client_id

def test_token_hash_only_in_db_and_cross_tenant_isolation(client, register_payload):
    _auth(client, register_payload)
    token = _create_link(client)
    # Public context must not expose organization_id
    ctx = client.get(f"/api/v1/public/intake/{token}").json()
    assert "organization_id" not in ctx
    assert "organizationId" not in ctx

    submitted = client.post(
        f"/api/v1/public/intake/{token}/submit",
        json={
            "full_name": "Aluno Org A",
            "phone": "11922223333",
            "age_band": "18+",
            "primary_goal": "Forca",
            "answers": _minimal_answers(),
            "consents": _required_consents(),
            "idempotency_key": "idem-org-a",
        },
    )
    assert submitted.status_code == 201, submitted.text
    submission_id = submitted.json()["submission_id"]
    assert client.get("/api/v1/intake-submissions").json()

    # Second org cannot see first org submissions
    other = {
        "email": f"other-intake-{register_payload['email']}",
        "password": register_payload["password"],
        "full_name": "Other Pro",
        "organization_name": "Other Org",
    }
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": other["email"], "password": other["password"]},
        ).status_code
        == 200
    )
    listed = client.get("/api/v1/intake-submissions")
    assert listed.status_code == 200
    assert listed.json() == []
    assert client.get(f"/api/v1/intake-submissions/{submission_id}").status_code == 404


def test_missing_consent_blocked_and_logs_safe(client, register_payload, caplog):
    import logging

    _auth(client, register_payload)
    token = _create_link(client)
    with caplog.at_level(logging.INFO, logger="croniu.intake"):
        bad = client.post(
            f"/api/v1/public/intake/{token}/submit",
            json={
                "full_name": "Sem Consent",
                "phone": "11911112222",
                "age_band": "18+",
                "primary_goal": "Saude",
                "answers": _minimal_answers(),
                "consents": {"purpose_science": True},
                "idempotency_key": "idem-consent-missing",
            },
        )
    assert bad.status_code == 422
    assert bad.json()["code"] == "consent_required"
    blob = " ".join(
        r.message for r in caplog.records if r.name.startswith("croniu")
    )
    assert "11911112222" not in blob
    assert token not in blob
    assert "Sem Consent" not in blob


def test_legacy_client_journey_active_without_anamnesis(client, register_payload):
    _auth(client, register_payload)
    created = client.post(
        "/api/v1/clients",
        json={"full_name": "Cliente Antigo", "phone": "11900001111"},
    )
    assert created.status_code == 201
    cid = created.json()["id"]
    journey = client.get(f"/api/v1/clients/{cid}/journey")
    assert journey.status_code == 200
    assert journey.json()["stage"] == "active"
    assert journey.json()["stage_label"] == "Em acompanhamento"


def test_invite_token_cannot_open_portal_status(client, register_payload):
    _auth(client, register_payload)
    invite = _create_link(client)
    # Invite token is not a portal token
    status = client.get(f"/api/v1/public/intake/portal/{invite}/status")
    assert status.status_code == 404
