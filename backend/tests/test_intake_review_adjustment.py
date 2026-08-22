"""Fix the "Solicitar ajuste" flow: request_changes_submission /
reject_submission used to unconditionally force a journey stage
transition that VALID_TRANSITIONS doesn't allow once a client's journey
has already moved past "pending_review" (the common case post-PR-30 for
any contextual-invite / confident-match reused client) — the whole
operation silently rolled back with a 422 the frontend never surfaced.
Also covers the resubmission-in-place mechanism and the portal's
correction link (see app.services.intake.{request_changes_submission,
reject_submission, submit_intake, get_public_intake_context,
get_portal_intake_status}).
"""

from __future__ import annotations

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


def _minimal_answers(*, chest_pain: str = "nao") -> dict:
    return {
        "a_primary_goal": "Condicionamento",
        "d_chest_pain": chest_pain,
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
            idempotency_key: str, chest_pain: str = "nao"):
    body = {
        "full_name": full_name,
        "phone": phone,
        "email": email,
        "age_band": "18+",
        "primary_goal": "Emagrecimento",
        "answers": _minimal_answers(chest_pain=chest_pain),
        "consents": _required_consents(),
        "idempotency_key": idempotency_key,
    }
    return client.post(f"/api/v1/public/intake/{token}/submit", json=body)


def _manual_client_with_active_journey(client: TestClient, *, full_name: str, phone: str) -> dict:
    """The exact precondition that triggered the bug: a manually-created
    client whose journey is lazily promoted to "active" the first time the
    professional opens the ficha, before any submission exists for them."""
    created = _create_manual_client(client, full_name=full_name, phone=phone)
    journey = client.get(f"/api/v1/clients/{created['id']}/journey")
    assert journey.status_code == 200
    assert journey.json()["stage"] == "active"
    return created


# --- The core regression: request-changes / reject on a reused client ------


def test_request_changes_succeeds_for_client_with_active_journey(client, register_payload):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Ativa Ajuste", phone="11955510001"
    )
    token = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Ativa Ajuste", phone="11955510001", email=None,
        idempotency_key="reqchg-active-1",
    )
    submission_id = submitted.json()["submission_id"]

    resp = client.post(
        f"/api/v1/intake-submissions/{submission_id}/request-changes",
        json={"message_to_client": "Indique os objetivos secundários."},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "changes_requested"
    assert body["message_to_client"] == "Indique os objetivos secundários."

    # The journey's real progress (stage) is untouched — only next_action
    # reflects the pending correction.
    journey = client.get(f"/api/v1/clients/{created['id']}/journey").json()
    assert journey["stage"] == "active"


def test_reject_succeeds_for_client_with_active_journey(client, register_payload):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Ativa Recusa", phone="11955510002"
    )
    token = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Ativa Recusa", phone="11955510002", email=None,
        idempotency_key="reject-active-1",
    )
    submission_id = submitted.json()["submission_id"]

    resp = client.post(
        f"/api/v1/intake-submissions/{submission_id}/reject",
        json={"rejection_internal_reason": "Fora do escopo", "message_to_client": None},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "rejected"
    journey = client.get(f"/api/v1/clients/{created['id']}/journey").json()
    assert journey["stage"] == "active"


def test_request_changes_still_transitions_journey_for_a_brand_new_client(
    client, register_payload
):
    """Regression guard: the existing, correct behavior for a genuinely
    first-time submission (journey freshly created at "pending_review")
    must be unchanged."""
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Novo Ajuste", phone="11955510003", email=None,
        idempotency_key="reqchg-new-1",
    )
    submission_id = submitted.json()["submission_id"]
    client_id = submitted.json()["client_id"]

    resp = client.post(
        f"/api/v1/intake-submissions/{submission_id}/request-changes",
        json={"message_to_client": "Complete sua disponibilidade."},
    )
    assert resp.status_code == 200, resp.text
    journey = client.get(f"/api/v1/clients/{client_id}/journey").json()
    assert journey["stage"] == "pending_anamnesis"


# --- Portal visibility ------------------------------------------------------


def test_portal_status_shows_changes_requested_with_message_and_correction_link(
    client, register_payload
):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Portal Ajuste", phone="11955510004"
    )
    token = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Portal Ajuste", phone="11955510004", email=None,
        idempotency_key="portal-reqchg-1",
    )
    portal_token = submitted.json()["portal_token"]

    client.post(
        f"/api/v1/intake-submissions/{submitted.json()['submission_id']}/request-changes",
        json={"message_to_client": "Indique os objetivos secundários."},
    )

    status = client.get(f"/api/v1/public/intake/portal/{portal_token}/status")
    assert status.status_code == 200
    body = status.json()
    assert body["submission_status"] == "changes_requested"
    assert body["message_to_client"] == "Indique os objetivos secundários."
    assert body["correction_path"] is not None
    assert body["correction_path"].startswith("/entrar/ci1.")
    assert body["correction_url"] is not None


def test_portal_status_has_no_correction_link_when_nothing_pending(client, register_payload):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Portal Sem Ajuste", phone="11955510005"
    )
    token = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Portal Sem Ajuste", phone="11955510005", email=None,
        idempotency_key="portal-noreqchg-1",
    )
    portal_token = submitted.json()["portal_token"]
    status = client.get(f"/api/v1/public/intake/portal/{portal_token}/status").json()
    assert status["submission_status"] == "pending_review"
    assert status["correction_path"] is None


def test_context_prefills_answers_and_message_when_correcting(client, register_payload):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Prefill Ajuste", phone="11955510006"
    )
    token1 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    submitted = _submit(
        client, token1, full_name="Prefill Ajuste", phone="11955510006", email=None,
        idempotency_key="prefill-1", chest_pain="nao",
    )
    submission_id = submitted.json()["submission_id"]
    client.post(
        f"/api/v1/intake-submissions/{submission_id}/request-changes",
        json={"message_to_client": "Indique os objetivos secundários."},
    )

    token2 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    ctx = client.get(f"/api/v1/public/intake/{token2}")
    assert ctx.status_code == 200
    body = ctx.json()
    assert body["correction_message"] == "Indique os objetivos secundários."
    assert body["prefill_answers"]["d_chest_pain"] == "nao"


def test_context_has_no_correction_message_for_a_fresh_contextual_invite(
    client, register_payload
):
    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Sem Pendencia", phone="11955510007")
    token = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    ctx = client.get(f"/api/v1/public/intake/{token}").json()
    assert ctx.get("correction_message") is None
    assert ctx.get("prefill_answers") is None


# --- Resubmission updates the same submission, no orphan, no dup client ----


def test_resubmission_updates_same_submission_no_new_client(client, register_payload):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Reenvio", phone="11955510008"
    )
    token1 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    first = _submit(
        client, token1, full_name="Reenvio", phone="11955510008", email=None,
        idempotency_key="resend-1",
    )
    submission_id = first.json()["submission_id"]
    client.post(
        f"/api/v1/intake-submissions/{submission_id}/request-changes",
        json={"message_to_client": "Indique os objetivos secundários."},
    )

    token2 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    second = _submit(
        client, token2, full_name="Reenvio", phone="11955510008", email=None,
        idempotency_key="resend-2", chest_pain="sim",
    )
    assert second.status_code == 201, second.text
    body = second.json()
    assert body["submission_id"] == submission_id  # same row, not a new one
    assert body["client_id"] == created["id"]
    assert body["status"] == "pending_review"

    # Only one submission total for this client — no orphaned duplicate.
    submissions = client.get(f"/api/v1/intake-submissions?client_id={created['id']}").json()
    assert len(submissions) == 1
    assert submissions[0]["status"] == "pending_review"

    # The professional's message is cleared once resolved by resubmission.
    detail = client.get(f"/api/v1/intake-submissions/{submission_id}").json()
    assert detail["message_to_client"] is None
    assert detail["anamnesis"]["answers_json"]["d_chest_pain"] == "sim"

    # Only one client — the fix under test is dedup, not just this flow.
    assert len(client.get("/api/v1/clients?status=active").json()) == 1


def test_resubmission_reuses_portal_access_old_link_still_works(client, register_payload):
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Portal Reenvio", phone="11955510009"
    )
    token1 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    first = _submit(
        client, token1, full_name="Portal Reenvio", phone="11955510009", email=None,
        idempotency_key="resend-portal-1",
    )
    old_portal_token = first.json()["portal_token"]
    client.post(
        f"/api/v1/intake-submissions/{first.json()['submission_id']}/request-changes",
        json={"message_to_client": "Ajuste, por favor."},
    )

    token2 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    _submit(
        client, token2, full_name="Portal Reenvio", phone="11955510009", email=None,
        idempotency_key="resend-portal-2",
    )

    still_valid = client.get(f"/api/v1/public/intake/portal/{old_portal_token}/status")
    assert still_valid.status_code == 200
    assert still_valid.json()["submission_status"] == "pending_review"


def test_full_loop_request_changes_resubmit_approve(client, register_payload):
    """Unit-level version of Jornada 3: request changes -> student sees it
    and corrects -> professional approves. One client throughout."""
    _auth(client, register_payload)
    created = _manual_client_with_active_journey(
        client, full_name="Loop Completo", phone="11955510011"
    )
    token1 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    first = _submit(
        client, token1, full_name="Loop Completo", phone="11955510011", email=None,
        idempotency_key="loop-1",
    )
    submission_id = first.json()["submission_id"]

    changes = client.post(
        f"/api/v1/intake-submissions/{submission_id}/request-changes",
        json={"message_to_client": "Indique os objetivos secundários."},
    )
    assert changes.status_code == 200, changes.text

    token2 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    resubmit = _submit(
        client, token2, full_name="Loop Completo", phone="11955510011", email=None,
        idempotency_key="loop-2",
    )
    assert resubmit.status_code == 201, resubmit.text
    assert resubmit.json()["submission_id"] == submission_id

    approved = client.post(
        f"/api/v1/intake-submissions/{submission_id}/approve",
        json={"evaluation_decision": "waived", "protocol_decision": "waived"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["client_id"] == created["id"]
    assert len(client.get("/api/v1/clients?status=active").json()) == 1


def test_pending_review_submission_is_not_treated_as_correcting(client, register_payload):
    """A submission still mid-review (never sent to changes_requested)
    must not be silently overwritten by a second contextual submit — that
    would let a retry clobber a submission the professional might already
    be reading."""
    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Meio Revisao", phone="11955510010")
    token1 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    first = _submit(
        client, token1, full_name="Meio Revisao", phone="11955510010", email=None,
        idempotency_key="midreview-1",
    )
    token2 = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]
    second = _submit(
        client, token2, full_name="Meio Revisao", phone="11955510010", email=None,
        idempotency_key="midreview-2",
    )
    assert second.status_code == 201, second.text
    # A second, independent submission — not silently merged into the
    # still-pending one.
    assert second.json()["submission_id"] != first.json()["submission_id"]
    assert second.json()["client_id"] == created["id"]
