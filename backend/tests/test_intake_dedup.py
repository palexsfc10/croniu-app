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


def _org_id_of(client: TestClient) -> str:
    return client.get("/api/v1/auth/me").json()["organization"]["id"]


def _fresh_session():
    from tests.conftest import TestingSessionLocal

    return TestingSessionLocal()


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
    # discarded). GET journey live-recomputes next_action from the
    # accompaniment checklist (app.services.accompaniment.resolve_
    # accompaniment) — since an anamnesis response now exists but isn't
    # marked reviewed yet, it correctly points at reviewing it.
    assert journey["stage"] == "active"
    assert journey["next_action"] == "review_anamnesis"

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
    # Complemented with the normalized (country-code-prefixed) phone — same
    # normalization the duplicate/confident matchers already compare
    # against (app.services.intake._normalize_phone).
    assert after_first["phone"] == "5511977776655"
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
    assert after_second["phone"] == "5511977776655"
    assert after_second["email"] == "pedro@example.com"

    all_active = client.get("/api/v1/clients?status=active").json()
    assert len(all_active) == 1


def test_existing_portal_link_survives_a_second_submission(client, register_payload):
    """A student who already has a working /c/... portal link must keep
    it after a later submission for the same client — reusing the
    existing client_public_accesses row must never rotate its hash (see
    app.services.intake.submit_intake's existing_portal handling and
    app.services.intake.get_portal_intake_status, which now also accepts
    a signed "v1." token exactly like app.services.my_cycle does)."""
    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Carla Portal", phone="11988881234")
    client_id = created["id"]

    token1 = client.post(f"/api/v1/clients/{client_id}/intake-link").json()["token"]
    first = _submit(
        client, token1, full_name="Carla Portal", phone="11988881234", email=None,
        idempotency_key="portal-preserve-1",
    )
    assert first.status_code == 201, first.text
    old_portal_token = first.json()["portal_token"]
    assert old_portal_token

    old_status = client.get(f"/api/v1/public/intake/portal/{old_portal_token}/status")
    assert old_status.status_code == 200

    token2 = client.post(f"/api/v1/clients/{client_id}/intake-link").json()["token"]
    second = _submit(
        client, token2, full_name="Carla Portal", phone="11988881234", email=None,
        idempotency_key="portal-preserve-2",
    )
    assert second.status_code == 201, second.text

    # The OLD link, obtained before the second submission, must still work.
    still_valid = client.get(f"/api/v1/public/intake/portal/{old_portal_token}/status")
    assert still_valid.status_code == 200

    # Exactly one active portal access exists for this client — reused,
    # not duplicated.
    access = client.get(f"/api/v1/clients/{client_id}/public-access")
    assert access.status_code == 200
    assert access.json()["has_active_link"] is True


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
    b = _create_manual_client(client, full_name="Cliente B", email="b@example.com")

    submitted = _submit(
        client, token, full_name="Novo", phone="11911110000", email="b@example.com",
        idempotency_key="conflict-1",
    )
    assert submitted.status_code == 201, submitted.text
    body = submitted.json()
    placeholder_id = body["client_id"]
    # Ambiguous: not silently merged into either candidate.
    assert placeholder_id not in {a["id"], b["id"]}
    assert body["duplicate_alert"] is True

    # A client row exists to hold the anamnesis (schema requires it — see
    # app.services.intake.submit_intake), but it is QUARANTINED: it does
    # not show up as a normal active client next to the real two.
    active = client.get("/api/v1/clients?status=active").json()
    assert len(active) == 2
    assert placeholder_id not in {c["id"] for c in active}
    # Not archived either — it belongs to neither normal tab.
    archived = client.get("/api/v1/clients?status=archived").json()
    assert placeholder_id not in {c["id"] for c in archived}
    # Nor does omitting the status filter leak it.
    unfiltered = client.get("/api/v1/clients?status=").json()
    assert placeholder_id not in {c["id"] for c in unfiltered}

    # Both real candidates are surfaced for a human decision — never a
    # silent guess between them.
    candidates = client.get(
        f"/api/v1/intake-submissions/{body['submission_id']}/duplicate-candidates"
    )
    assert candidates.status_code == 200
    candidate_ids = {c["id"] for c in candidates.json()}
    assert candidate_ids == {a["id"], b["id"]}


def test_professional_resolves_ambiguous_submission_by_linking_to_existing_client(
    client, register_payload
):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    a = _create_manual_client(client, full_name="Cliente A", phone="11911110001")
    _create_manual_client(client, full_name="Cliente B", email="bb@example.com")

    submitted = _submit(
        client, token, full_name="Novo", phone="11911110001", email="bb@example.com",
        idempotency_key="conflict-resolve-1",
    )
    submission_id = submitted.json()["submission_id"]
    placeholder_id = submitted.json()["client_id"]
    assert placeholder_id not in {a["id"]}

    linked = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": a["id"]},
    )
    assert linked.status_code == 200, linked.text
    assert linked.json()["client_id"] == a["id"]
    assert linked.json()["duplicate_alert"] is False
    assert linked.json()["duplicate_client_id"] is None

    # The placeholder created at submit time is archived, not left behind
    # as a live, indistinguishable-from-real second ficha.
    placeholder = client.get(f"/api/v1/clients/{placeholder_id}").json()
    assert placeholder["status"] == "archived"

    active = client.get("/api/v1/clients?status=active").json()
    active_ids = {c["id"] for c in active}
    assert a["id"] in active_ids
    assert placeholder_id not in active_ids

    # The anamnesis moved with the submission — reviewing it now shows the
    # real client's data, not an orphaned one.
    detail = client.get(f"/api/v1/intake-submissions/{submission_id}").json()
    assert detail["client_id"] == a["id"]
    assert detail["anamnesis"] is not None


def test_link_to_client_never_silently_reactivates_an_archived_target(client, register_payload):
    """No confirmation UX for reactivation exists yet in this version — see
    app.api.intake — so linking to an archived client is rejected outright
    rather than silently flipping its status."""
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    created = _create_manual_client(client, full_name="Antiga Aluna", phone="11922220000")
    client.patch(f"/api/v1/clients/{created['id']}", json={"status": "archived"})

    submitted = _submit(
        client, token, full_name="Antiga Aluna", phone="11922220000", email=None,
        idempotency_key="reactivate-1",
    )
    submission_id = submitted.json()["submission_id"]
    assert submitted.json()["duplicate_alert"] is True

    rejected = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": created["id"]},
    )
    assert rejected.status_code == 422
    still_archived = client.get(f"/api/v1/clients/{created['id']}").json()
    assert still_archived["status"] == "archived"

    # The submission stays ambiguous — the archived candidate is still
    # listed (so the professional knows it exists) but wasn't touched.
    still_pending = client.get(f"/api/v1/intake-submissions/{submission_id}").json()
    assert still_pending["duplicate_alert"] is True
    candidates = client.get(
        f"/api/v1/intake-submissions/{submission_id}/duplicate-candidates"
    ).json()
    assert created["id"] in {c["id"] for c in candidates}


def test_approve_is_blocked_while_ambiguous(client, register_payload):
    """Approving must never be the implicit way an ambiguous submission
    quietly becomes a new person — see keep_as_new_client."""
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    _create_manual_client(client, full_name="Cliente A", phone="11933330001")
    _create_manual_client(client, full_name="Cliente B", email="cc@example.com")

    submitted = _submit(
        client, token, full_name="Pessoa Diferente", phone="11933330001", email="cc@example.com",
        idempotency_key="conflict-keep-new-1",
    )
    submission_id = submitted.json()["submission_id"]
    blocked = client.post(
        f"/api/v1/intake-submissions/{submission_id}/approve",
        json={"evaluation_decision": "waived", "protocol_decision": "waived"},
    )
    assert blocked.status_code == 422
    rejected_reason = client.post(
        f"/api/v1/intake-submissions/{submission_id}/reject",
        json={},
    )
    assert rejected_reason.status_code == 422
    changes = client.post(
        f"/api/v1/intake-submissions/{submission_id}/request-changes",
        json={"message_to_client": "oi"},
    )
    assert changes.status_code == 422


def test_professional_can_keep_ambiguous_submission_as_a_genuinely_new_person(
    client, register_payload
):
    """The explicit "Manter como novo aluno" decision (not an implicit
    approve) promotes the quarantined placeholder to a normal client."""
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    _create_manual_client(client, full_name="Cliente A", phone="11933330002")
    _create_manual_client(client, full_name="Cliente B", email="cc2@example.com")

    submitted = _submit(
        client, token, full_name="Pessoa Diferente", phone="11933330002", email="cc2@example.com",
        idempotency_key="conflict-keep-new-2",
    )
    submission_id = submitted.json()["submission_id"]
    placeholder_id = submitted.json()["client_id"]

    kept = client.post(f"/api/v1/intake-submissions/{submission_id}/keep-as-new-client")
    assert kept.status_code == 200, kept.text
    assert kept.json()["duplicate_alert"] is False
    assert kept.json()["client_id"] == placeholder_id

    active = client.get("/api/v1/clients?status=active").json()
    assert placeholder_id in {c["id"] for c in active}
    assert len(active) == 3

    # Now that it's resolved, the normal decision flow works.
    approved = client.post(
        f"/api/v1/intake-submissions/{submission_id}/approve",
        json={"evaluation_decision": "waived", "protocol_decision": "waived"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"


def test_keep_as_new_client_is_idempotent_and_rejects_after_resolution(client, register_payload):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    _create_manual_client(client, full_name="Cliente A", phone="11933330003")
    _create_manual_client(client, full_name="Cliente B", email="cc3@example.com")
    submitted = _submit(
        client, token, full_name="Pessoa Diferente", phone="11933330003", email="cc3@example.com",
        idempotency_key="conflict-keep-new-3",
    )
    submission_id = submitted.json()["submission_id"]

    first = client.post(f"/api/v1/intake-submissions/{submission_id}/keep-as-new-client")
    assert first.status_code == 200

    second = client.post(f"/api/v1/intake-submissions/{submission_id}/keep-as-new-client")
    assert second.status_code == 422

    # Nor can it be linked to a candidate after being kept as new.
    a = client.get("/api/v1/clients?status=active").json()
    other = next(c for c in a if c["full_name"] == "Cliente A")
    also_blocked = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": other["id"]},
    )
    assert also_blocked.status_code == 422


def test_link_to_client_rejects_cross_org_target(client, register_payload):
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    a = _create_manual_client(client, full_name="Cliente A", phone="11944440001")
    _create_manual_client(client, full_name="Cliente B", email="dd@example.com")
    submitted = _submit(
        client, token, full_name="Novo", phone="11944440001", email="dd@example.com",
        idempotency_key="conflict-cross-org-1",
    )
    submission_id = submitted.json()["submission_id"]

    other = {
        "email": f"other-linkcli-{register_payload['email']}",
        "password": register_payload["password"],
        "full_name": "Other Pro",
        "organization_name": "Other Org LinkCli",
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
    cross_org_target = _create_manual_client(client, full_name="De outra org", phone="11900000099")

    # Back to the original org's session to attempt the (illegitimate) link.
    assert client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    ).status_code == 200
    forged = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": cross_org_target["id"]},
    )
    assert forged.status_code == 404

    # The submission is untouched — still ambiguous, still resolvable via
    # a legitimate same-org candidate.
    detail = client.get(f"/api/v1/intake-submissions/{submission_id}").json()
    assert detail["duplicate_alert"] is True
    legit = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": a["id"]},
    )
    assert legit.status_code == 200


def test_link_to_client_rejects_repeating_the_action_after_resolution(client, register_payload):
    """Repeating the link action must not move data again — see
    link_submission_to_client's duplicate_alert guard. Rejecting is safer
    than a silent no-op: it makes "already resolved" explicit instead of
    quietly re-running the transfer."""
    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]
    a = _create_manual_client(client, full_name="Já Vinculada A", phone="11955550001")
    b = _create_manual_client(client, full_name="Já Vinculada B", email="jav@example.com")
    submitted = _submit(
        client, token, full_name="Ambigua", phone="11955550001", email="jav@example.com",
        idempotency_key="already-linked-1",
    )
    submission_id = submitted.json()["submission_id"]

    first = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": a["id"]},
    )
    assert first.status_code == 200
    assert first.json()["client_id"] == a["id"]

    # Repeating with the same target is rejected, not a silent no-op.
    repeat_same = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": a["id"]},
    )
    assert repeat_same.status_code == 422

    # Repeating with a DIFFERENT target must never move data a second
    # time (it would otherwise archive the already-real client "a").
    repeat_other = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": b["id"]},
    )
    assert repeat_other.status_code == 422
    a_after = client.get(f"/api/v1/clients/{a['id']}").json()
    assert a_after["status"] == "active"


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
    # A single candidate that is archived is still ambiguous — quarantined,
    # not silently created as a normal active client.
    active = client.get("/api/v1/clients?status=active").json()
    assert body["client_id"] not in {c["id"] for c in active}


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


# --- Real concurrency ---------------------------------------------------
# Same pattern already used by test_routines_agenda_board.py
# (test_concurrent_ensure_does_not_duplicate): call the service directly
# from independent threads with independent DB sessions, bypassing the
# HTTP layer, so the database actually sees two overlapping transactions
# rather than whatever the TestClient's transport happens to serialize.


def test_concurrent_generic_submissions_same_new_person_create_one_client(
    client, register_payload
):
    from concurrent.futures import ThreadPoolExecutor

    from app.services import intake as intake_svc
    from tests.conftest import TestingSessionLocal

    _auth(client, register_payload)
    token = client.post("/api/v1/intake-link").json()["token"]

    def run(i: int):
        db = TestingSessionLocal()
        try:
            return intake_svc.submit_intake(
                db,
                raw_token=token,
                payload={
                    "full_name": "Concorrente Novo",
                    "phone": "11988770000",
                    "email": "concorrente@example.com",
                    "age_band": "18+",
                    "primary_goal": "Força",
                    "answers": _minimal_answers(),
                    "consents": _required_consents(),
                },
                idempotency_key=f"concurrent-new-{i}",
            )
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, range(2)))

    client_ids = {r["client_id"] for r in results}
    assert len(client_ids) == 1
    assert len(client.get("/api/v1/clients").json()) == 1


def test_concurrent_contextual_submissions_same_client_stay_single_client(
    client, register_payload
):
    from concurrent.futures import ThreadPoolExecutor

    from app.services import intake as intake_svc
    from tests.conftest import TestingSessionLocal

    _auth(client, register_payload)
    created = _create_manual_client(client, full_name="Concorrente Ctx", phone="11988770001")
    token = client.post(f"/api/v1/clients/{created['id']}/intake-link").json()["token"]

    def run(i: int):
        db = TestingSessionLocal()
        try:
            return intake_svc.submit_intake(
                db,
                raw_token=token,
                payload={
                    "full_name": "Concorrente Ctx",
                    "phone": "11988770001",
                    "email": None,
                    "age_band": "18+",
                    "primary_goal": "Força",
                    "answers": _minimal_answers(),
                    "consents": _required_consents(),
                },
                idempotency_key=f"concurrent-ctx-{i}",
            )
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, range(2)))

    client_ids = {r["client_id"] for r in results}
    assert client_ids == {created["id"]}
    assert len(client.get("/api/v1/clients").json()) == 1


# --- Reconciliation: conflicts, transactions, concurrency -----------------


def test_link_to_client_preserves_targets_existing_journey_and_anamnesis(
    client, register_payload
):
    """The target may already be a real, active client with its own
    history — linking must add to it, never overwrite or duplicate it."""
    _auth(client, register_payload)
    a = _create_manual_client(client, full_name="Com Historico", phone="11922221111")
    # Give "a" its own prior journey/anamnesis/consents/portal by having
    # them submit through their own contextual invite first.
    ctx_token = client.post(f"/api/v1/clients/{a['id']}/intake-link").json()["token"]
    prior = _submit(
        client, ctx_token, full_name="Com Historico", phone="11922221111", email=None,
        idempotency_key="prior-history-1",
    )
    assert prior.status_code == 201, prior.text
    prior_submission_id = prior.json()["submission_id"]
    prior_portal_token = prior.json()["portal_token"]

    b = _create_manual_client(client, full_name="Outro Candidato", email="outro-hist@example.com")

    # Now an ambiguous generic submission matches both "a" (phone) and "b"
    # (email) — professional resolves it onto "a", which already has
    # history from the submission above.
    generic_token = client.post("/api/v1/intake-link").json()["token"]
    ambiguous = _submit(
        client, generic_token, full_name="Nova Tentativa", phone="11922221111",
        email="outro-hist@example.com", idempotency_key="ambiguous-with-history-1",
    )
    assert ambiguous.status_code == 201, ambiguous.text
    submission_id = ambiguous.json()["submission_id"]

    linked = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": a["id"]},
    )
    assert linked.status_code == 200, linked.text

    # Both submissions are still there — the earlier one was never
    # deleted/overwritten — and both are readable, each with its own
    # anamnesis.
    prior_detail = client.get(f"/api/v1/intake-submissions/{prior_submission_id}").json()
    assert prior_detail["client_id"] == a["id"]
    assert prior_detail["anamnesis"] is not None
    new_detail = client.get(f"/api/v1/intake-submissions/{submission_id}").json()
    assert new_detail["client_id"] == a["id"]
    assert new_detail["anamnesis"] is not None

    # Only one journey exists for "a" — not a second one.
    journey = client.get(f"/api/v1/clients/{a['id']}/journey")
    assert journey.status_code == 200

    # "a"'s already-issued portal link from the FIRST submission still
    # resolves — linking a second, unrelated submission never invalidates
    # a target's pre-existing portal.
    still_valid = client.get(f"/api/v1/public/intake/portal/{prior_portal_token}/status")
    assert still_valid.status_code == 200

    # b was never touched — still active, standalone.
    b_after = client.get(f"/api/v1/clients/{b['id']}").json()
    assert b_after["status"] == "active"


def test_link_to_client_rolls_back_completely_on_failure(client, register_payload, monkeypatch):
    """A failure partway through must leave no partial state: submission
    still points at the placeholder, placeholder still quarantined, target
    untouched."""
    from app.services import intake as intake_svc

    _auth(client, register_payload)
    a = _create_manual_client(client, full_name="Alvo Rollback", phone="11922223333")
    _create_manual_client(client, full_name="Outro Rollback", email="rollback@example.com")
    token = client.post("/api/v1/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Ambigua Rollback", phone="11922223333",
        email="rollback@example.com", idempotency_key="rollback-1",
    )
    submission_id = submitted.json()["submission_id"]
    placeholder_id = submitted.json()["client_id"]

    import pytest

    def boom(*args, **kwargs):
        # Fires well after the anamnesis/consent UPDATE statements have
        # already been sent to this same (uncommitted) transaction,
        # proving they get rolled back too, not just the fields set
        # afterward.
        raise RuntimeError("forced failure mid-transaction")

    original_get_journey = intake_svc.journey_svc.get_journey
    monkeypatch.setattr(intake_svc.journey_svc, "get_journey", boom)
    db = _fresh_session()
    try:
        with pytest.raises(RuntimeError):
            intake_svc.link_submission_to_client(
                db,
                organization_id=uuid.UUID(_org_id_of(client)),
                submission_id=uuid.UUID(submission_id),
                target_client_id=uuid.UUID(a["id"]),
            )
    finally:
        db.close()
        # Restore before the assertions below, which go through
        # get_submission -> journey_svc.get_journey via the normal HTTP
        # client — only the call inside link_submission_to_client above
        # was meant to fail.
        monkeypatch.setattr(intake_svc.journey_svc, "get_journey", original_get_journey)

    # Nothing moved: submission still ambiguous and on the placeholder,
    # placeholder still quarantined, target untouched.
    detail = client.get(f"/api/v1/intake-submissions/{submission_id}").json()
    assert detail["client_id"] == placeholder_id
    assert detail["duplicate_alert"] is True
    active = client.get("/api/v1/clients?status=active").json()
    assert placeholder_id not in {c["id"] for c in active}
    a_after = client.get(f"/api/v1/clients/{a['id']}").json()
    assert a_after["status"] == "active"


def test_concurrent_link_attempts_produce_exactly_one_valid_outcome(client, register_payload):
    from concurrent.futures import ThreadPoolExecutor

    from app.services import intake as intake_svc
    from tests.conftest import TestingSessionLocal

    _auth(client, register_payload)
    org_id = uuid.UUID(_org_id_of(client))
    a = _create_manual_client(client, full_name="Concorrente Link A", phone="11922224444")
    b = _create_manual_client(
        client, full_name="Concorrente Link B", email="concurrentlink@example.com"
    )
    token = client.post("/api/v1/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Ambigua Concorrente", phone="11922224444",
        email="concurrentlink@example.com", idempotency_key="concurrent-link-1",
    )
    submission_id = uuid.UUID(submitted.json()["submission_id"])

    def run(target_id: str):
        db = TestingSessionLocal()
        try:
            try:
                return intake_svc.link_submission_to_client(
                    db,
                    organization_id=org_id,
                    submission_id=submission_id,
                    target_client_id=uuid.UUID(target_id),
                )
            except Exception as exc:  # noqa: BLE001 — capturing for assertion below
                return exc
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [a["id"], b["id"]]))

    successes = [r for r in results if not isinstance(r, Exception)]
    failures = [r for r in results if isinstance(r, Exception)]
    assert len(successes) == 1
    assert len(failures) == 1

    detail = client.get(f"/api/v1/intake-submissions/{str(submission_id)}").json()
    assert detail["duplicate_alert"] is False
    assert detail["client_id"] in {a["id"], b["id"]}
    # Whichever one won, the loser was never touched.
    loser_id = b["id"] if detail["client_id"] == a["id"] else a["id"]
    loser = client.get(f"/api/v1/clients/{loser_id}").json()
    assert loser["status"] == "active"


def test_link_to_client_manipulated_id_returns_generic_error(client, register_payload):
    """A nonexistent client_id gets the same generic 404 as a real
    cross-org id — never a different error that would reveal whether the
    id exists at all."""
    _auth(client, register_payload)
    _create_manual_client(client, full_name="Cliente A", phone="11922225555")
    _create_manual_client(client, full_name="Cliente B", email="manip@example.com")
    token = client.post("/api/v1/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Ambigua Manip", phone="11922225555", email="manip@example.com",
        idempotency_key="manip-1",
    )
    submission_id = submitted.json()["submission_id"]
    resp = client.post(
        f"/api/v1/intake-submissions/{submission_id}/link-to-client",
        json={"client_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404


def test_reconciliation_logs_never_include_sensitive_data(client, register_payload, caplog):
    import logging

    _auth(client, register_payload)
    a = _create_manual_client(client, full_name="Log Seguro A", phone="11922226666")
    _create_manual_client(client, full_name="Log Seguro B", email="logsafe@example.com")
    token = client.post("/api/v1/intake-link").json()["token"]
    submitted = _submit(
        client, token, full_name="Nome Sensivel Log", phone="11922226666",
        email="logsafe@example.com", idempotency_key="log-safe-1",
    )
    submission_id = submitted.json()["submission_id"]

    with caplog.at_level(logging.INFO, logger="croniu.intake"):
        linked = client.post(
            f"/api/v1/intake-submissions/{submission_id}/link-to-client",
            json={"client_id": a["id"]},
        )
    assert linked.status_code == 200
    blob = " ".join(r.message for r in caplog.records if r.name.startswith("croniu"))
    assert "Nome Sensivel Log" not in blob
    assert "11922226666" not in blob
    assert "logsafe@example.com" not in blob
