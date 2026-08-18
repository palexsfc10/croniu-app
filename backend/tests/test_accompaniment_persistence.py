"""Accompaniment checklist persistence and entity-derived cycle/agenda."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def test_na_survives_reload_and_cycle_is_recognized(client, register_payload):
    _auth(client, register_payload)
    created = client.post("/api/v1/clients", json={"full_name": "Cliente Prep"})
    assert created.status_code == 201
    client_id = created.json()["id"]

    journey = client.get(f"/api/v1/clients/{client_id}/journey")
    assert journey.status_code == 200
    assert journey.json()["accompaniment_checklist"]["cycle"] == "todo"

    na = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "evaluation", "status": "na"},
    )
    assert na.status_code == 200, na.text
    assert na.json()["accompaniment_checklist"]["evaluation"] == "na"

    later = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "plan", "status": "later"},
    )
    assert later.status_code == 200
    assert later.json()["accompaniment_checklist"]["plan"] == "later"

    analyzed = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "anamnesis", "status": "done"},
    )
    assert analyzed.status_code == 200
    assert analyzed.json()["accompaniment_checklist"]["anamnesis"] == "done"
    assert analyzed.json()["anamnesis_reviewed_at"]

    again = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "anamnesis", "status": "done"},
    )
    assert again.status_code == 200
    assert again.json()["anamnesis_reviewed_at"] == analyzed.json()["anamnesis_reviewed_at"]

    reload = client.get(f"/api/v1/clients/{client_id}/journey")
    body = reload.json()
    assert body["accompaniment_checklist"]["evaluation"] == "na"
    assert body["accompaniment_checklist"]["plan"] == "later"
    assert body["accompaniment_checklist"]["anamnesis"] == "done"

    svc = client.post(
        "/api/v1/services",
        json={"name": "Aula padrão", "default_price_cents": 9000, "default_duration_minutes": 60},
    )
    tmpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x — mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": svc.json()["id"],
            "cycle_template_id": tmpl.json()["id"],
            "starts_on": "2026-08-17",
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "generate_appointments": True,
            "idempotency_key": "prep-cycle-1",
        },
    )
    assert cycle.status_code == 201, cycle.text

    after = client.get(f"/api/v1/clients/{client_id}/journey")
    assert after.json()["accompaniment_checklist"]["cycle"] == "done"
    assert after.json()["accompaniment_checklist"]["agenda"] == "done"
    assert after.json()["accompaniment_checklist"]["evaluation"] == "na"
    assert after.json()["next_action"] != "create_cycle"
    listed = client.get("/api/v1/cycles", params={"client_id": client_id})
    assert listed.json()[0]["id"] == cycle.json()["id"]


def test_manual_client_anamnesis_defaults_pending_never_auto_na(
    client, register_payload
):
    """A client added directly by the professional (no public-intake
    submission) must default to "todo"/Pendente for anamnesis, exactly like
    every other checklist step — never a silently-inferred "na". Whether
    anamnesis applies is a professional decision (same precedence rule as
    evaluation/plan's waived/external), not a fact derived from how the
    client was created; auto-resolving it to "na" would let a client whose
    anamnesis was simply never requested read as "Concluído"-adjacent
    progress it didn't earn.

    An earlier version of this rule *did* auto-default to "na" specifically
    to avoid the checklist getting stuck forever on anamnesis for manual
    clients (see docs/sprints/AUDIT_UX_FLOW_REVIEW.md) — that dead-end is
    now avoided differently: the professional has an explicit "não se
    aplica" action for this step (same as every other step), so nothing is
    stuck; it just requires a decision instead of assuming one."""
    _auth(client, register_payload)
    created = client.post("/api/v1/clients", json={"full_name": "Cliente Manual"})
    assert created.status_code == 201
    client_id = created.json()["id"]

    journey = client.get(f"/api/v1/clients/{client_id}/journey")
    assert journey.status_code == 200
    body = journey.json()
    assert body["accompaniment_checklist"]["anamnesis"] == "todo"
    assert body["next_action"] == "review_anamnesis"
    assert body["accompaniment_summaries"]["anamnesis"]

    # Explicit "não se aplica" resolves it — same precedence every other
    # step already has, now also available for anamnesis.
    marked_na = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "anamnesis", "status": "na"},
    )
    assert marked_na.status_code == 200, marked_na.text
    assert marked_na.json()["accompaniment_checklist"]["anamnesis"] == "na"
    assert marked_na.json()["next_action"] != "review_anamnesis"

    # Reconsidering and marking it reviewed instead still works (explicit
    # decisions are never one-way).
    marked_done = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "anamnesis", "status": "done"},
    )
    assert marked_done.status_code == 200
    assert marked_done.json()["accompaniment_checklist"]["anamnesis"] == "done"


def _create_intake_link(client: TestClient) -> str:
    created = client.post("/api/v1/intake-link")
    assert created.status_code == 200, created.text
    return created.json()["token"]


def _submit_intake(client: TestClient, token: str, *, idem: str) -> dict:
    payload = {
        "full_name": "Aluno Convite",
        "phone": "11999990099",
        "age_band": "18+",
        "primary_goal": "Condicionamento",
        "answers": {
            "a_primary_goal": "Condicionamento",
            "d_chest_pain": "nao",
            "d_dizziness": "nao",
            "g_chest_pain_exertion": "nao",
            "g_dizziness_exertion": "nao",
        },
        "consents": {
            "purpose_science": True,
            "sensitive_health": True,
            "self_declared": True,
            "not_medical": True,
            "privacy_policy": True,
            "whatsapp_optional": False,
        },
        "idempotency_key": idem,
        "organization_id": "00000000-0000-0000-0000-000000000099",
    }
    submitted = client.post(f"/api/v1/public/intake/{token}/submit", json=payload)
    assert submitted.status_code == 201, submitted.text
    return submitted.json()


def test_checklist_fully_done_clears_next_action_and_activates_stage_manual_client(
    client, register_payload
):
    """Owner-reported contradiction: the résumé card kept telling the
    professional to "Preparar acompanhamento" even though every checklist
    step already showed Concluído.

    Root cause: apply_step() persisted the literal string
    "prepare_accompaniment" onto journey.next_action as a fallback whenever
    resolve_accompaniment() had nothing left to report (next_action=None),
    and _journey_out() preferred that stale persisted value over the fresh
    None. For a manually-created client (journey starts stage="active"
    already, see ensure_legacy_active_journey), this is the only broken
    piece — the sibling test below covers the invite-flow client, where the
    stage itself was also stuck.

    Asserts next_action reflects a genuinely finished state on a fresh GET
    — not just in the PATCH response."""
    _auth(client, register_payload)
    created = client.post("/api/v1/clients", json={"full_name": "Cliente Pronto"})
    assert created.status_code == 201
    client_id = created.json()["id"]

    baseline = client.get(f"/api/v1/clients/{client_id}/journey").json()
    assert baseline["stage"] == "active"
    assert baseline["accompaniment_checklist"]["activate"] == "done"
    assert baseline["accompaniment_checklist"]["anamnesis"] == "todo"

    na = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "anamnesis", "status": "na"},
    )
    assert na.status_code == 200, na.text

    for step in ("evaluation", "plan", "cycle", "agenda", "routine"):
        done = client.patch(
            f"/api/v1/clients/{client_id}/journey/accompaniment-step",
            json={"step": step, "status": "done"},
        )
        assert done.status_code == 200, done.text

    body = done.json()
    assert body["next_action"] is None
    assert all(v in {"done", "na"} for v in body["accompaniment_checklist"].values())

    # Not just the mutation response — a fresh, independent GET must agree.
    reread = client.get(f"/api/v1/clients/{client_id}/journey").json()
    assert reread["next_action"] is None
    assert reread["progress_defined"] == reread["progress_total"]


def test_checklist_fully_done_clears_next_action_and_activates_stage_invite_client(
    client, register_payload
):
    """Same contradiction as above, reproduced end-to-end for a client who
    came through the public intake link and was approved — the exact path
    the owner's screenshots show (anamnesis already "Analisada", not "Não
    se aplica"). Here journey.stage starts at "approved", not "active":
    marking the checklist's "activate" step done must be a real state
    transition (journey.stage -> "active"), not just a JSON flag, or every
    stage-gated branch elsewhere keeps treating the client as still in
    preparation forever — see journey.VALID_TRANSITIONS and
    accompaniment.apply_step."""
    payload = dict(register_payload)
    payload["profession_code"] = "personal_trainer"
    _auth(client, payload)
    token = _create_intake_link(client)
    submitted = _submit_intake(client, token, idem="prep-invite-1")
    submission_id = submitted["submission_id"]

    approved = client.post(
        f"/api/v1/intake-submissions/{submission_id}/approve", json={}
    )
    assert approved.status_code == 200, approved.text
    client_id = approved.json()["client_id"]
    assert client_id

    started = client.get(f"/api/v1/clients/{client_id}/journey").json()
    assert started["stage"] == "approved"
    assert started["accompaniment_checklist"]["anamnesis"] == "todo"
    assert started["accompaniment_checklist"]["activate"] == "todo"

    for step in ("anamnesis", "evaluation", "plan", "cycle", "agenda", "routine"):
        done = client.patch(
            f"/api/v1/clients/{client_id}/journey/accompaniment-step",
            json={"step": step, "status": "done"},
        )
        assert done.status_code == 200, done.text

    mid = client.get(f"/api/v1/clients/{client_id}/journey").json()
    assert mid["stage"] == "approved"
    assert mid["next_action"] == "activate_accompaniment"
    assert mid["accompaniment_checklist"]["activate"] == "todo"

    activated = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "activate", "status": "done"},
    )
    assert activated.status_code == 200, activated.text
    body = activated.json()
    assert body["accompaniment_checklist"]["activate"] == "done"
    assert body["next_action"] is None
    assert body["stage"] == "active"

    reread = client.get(f"/api/v1/clients/{client_id}/journey").json()
    assert reread["next_action"] is None
    assert reread["stage"] == "active"
    assert all(v in {"done", "na"} for v in reread["accompaniment_checklist"].values())
    assert reread["progress_defined"] == reread["progress_total"]


def test_invalid_step_and_status_rejected(client, register_payload):
    _auth(client, register_payload)
    created = client.post("/api/v1/clients", json={"full_name": "Cliente Valid"})
    client_id = created.json()["id"]
    bad_step = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "billing", "status": "done"},
    )
    assert bad_step.status_code == 422
    assert bad_step.json()["code"] == "invalid_step"
    bad_status = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "evaluation", "status": "skipped"},
    )
    assert bad_status.status_code == 422
    assert bad_status.json()["code"] == "invalid_status"
    extra = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "evaluation", "status": "na", "organization_id": "x"},
    )
    assert extra.status_code == 422


def test_unauthenticated_and_missing_client(client, register_payload):
    _auth(client, register_payload)
    missing = client.patch(
        "/api/v1/clients/00000000-0000-0000-0000-000000000001/journey/accompaniment-step",
        json={"step": "evaluation", "status": "na"},
    )
    assert missing.status_code == 404
    client.cookies.clear()
    anon = client.patch(
        "/api/v1/clients/00000000-0000-0000-0000-000000000001/journey/accompaniment-step",
        json={"step": "evaluation", "status": "na"},
    )
    assert anon.status_code in {401, 403}


def test_tenant_cannot_patch_other_client(client, register_payload):
    _auth(client, register_payload)
    created = client.post("/api/v1/clients", json={"full_name": "Cliente A"})
    client_id = created.json()["id"]
    cookie_a = client.cookies.get("croniu_session")
    other = {
        "email": f"other_{register_payload['email']}",
        "password": "SenhaForte1!",
        "full_name": "Outro Pro",
        "organization_name": "Outro Studio",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    forbidden = client.patch(
        f"/api/v1/clients/{client_id}/journey/accompaniment-step",
        json={"step": "evaluation", "status": "na"},
    )
    assert forbidden.status_code == 404
    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    ok = client.get(f"/api/v1/clients/{client_id}/journey")
    assert ok.status_code == 200
    assert (ok.json()["accompaniment_checklist"] or {}).get("evaluation") != "na"


def test_cancelled_cycle_is_not_current(client, register_payload):
    _auth(client, register_payload)
    cid = client.post("/api/v1/clients", json={"full_name": "Cliente Cancel"}).json()["id"]
    svc = client.post(
        "/api/v1/services",
        json={"name": "Aula padrão", "default_price_cents": 9000, "default_duration_minutes": 60},
    ).json()["id"]
    tmpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x — mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": cid,
            "service_id": svc,
            "cycle_template_id": tmpl,
            "starts_on": "2026-08-17",
            "weekdays": [0, 2],
            "starts_time": "10:00:00",
            "generate_appointments": True,
            "idempotency_key": "prep-cancel-1",
        },
    )
    assert created.status_code == 201, created.text
    assert client.post(f"/api/v1/cycles/{created.json()['id']}/cancel").status_code == 200
    journey = client.get(f"/api/v1/clients/{cid}/journey").json()
    assert journey["accompaniment_checklist"]["cycle"] == "todo"


def test_schedule_conflict_leaves_no_partial_cycle(client, register_payload):
    _auth(client, register_payload)
    cid = client.post("/api/v1/clients", json={"full_name": "Cliente Conflito"}).json()["id"]
    svc = client.post(
        "/api/v1/services",
        json={"name": "Aula padrão", "default_price_cents": 9000, "default_duration_minutes": 60},
    ).json()["id"]
    tmpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x — mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    blocker = client.post(
        "/api/v1/appointments",
        json={
            "client_id": cid,
            "starts_at": "2026-08-17T09:00:00-03:00",
            "ends_at": "2026-08-17T10:00:00-03:00",
        },
    )
    assert blocker.status_code == 201, blocker.text
    conflict = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": cid,
            "service_id": svc,
            "cycle_template_id": tmpl,
            "starts_on": "2026-08-17",
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "generate_appointments": True,
            "create_receivable": True,
            "idempotency_key": "prep-conflict-atomic",
        },
    )
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["code"] == "SCHEDULE_CONFLICT"
    assert client.get("/api/v1/cycles").json() == []
    assert client.get("/api/v1/receivables").json() == []
    journey = client.get(f"/api/v1/clients/{cid}/journey").json()
    assert journey["accompaniment_checklist"]["cycle"] == "todo"
    retry = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": cid,
            "service_id": svc,
            "cycle_template_id": tmpl,
            "starts_on": "2026-08-17",
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "generate_appointments": True,
            "create_receivable": True,
            "idempotency_key": "prep-conflict-atomic",
        },
    )
    assert retry.status_code == 409
    ok = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": cid,
            "service_id": svc,
            "cycle_template_id": tmpl,
            "starts_on": "2026-08-17",
            "weekdays": [0, 2],
            "starts_time": "11:00:00",
            "generate_appointments": True,
            "create_receivable": True,
            "idempotency_key": "prep-conflict-retry",
        },
    )
    assert ok.status_code == 201, ok.text
    after = client.get(f"/api/v1/clients/{cid}/journey").json()
    assert after["accompaniment_checklist"]["cycle"] == "done"
    assert after["accompaniment_checklist"]["agenda"] == "done"


def _cycle_payload(cid: str, svc: str, tmpl: str, key: str, time: str = "09:00:00") -> dict:
    return {
        "client_id": cid,
        "service_id": svc,
        "cycle_template_id": tmpl,
        "starts_on": "2026-08-17",
        "weekdays": [0, 2],
        "starts_time": time,
        "generate_appointments": True,
        "create_receivable": True,
        "idempotency_key": key,
    }


def test_agenda_complete_only_counts_own_valid_distinct_lessons(
    client, register_payload, db_session
):
    from uuid import UUID

    from app.models.appointment import Appointment
    from sqlalchemy import select

    _auth(client, register_payload)
    cid = client.post("/api/v1/clients", json={"full_name": "Cliente Agenda"}).json()["id"]
    other = client.post("/api/v1/clients", json={"full_name": "Outro Aluno"}).json()["id"]
    svc = client.post(
        "/api/v1/services",
        json={"name": "Aula padrão", "default_price_cents": 9000, "default_duration_minutes": 60},
    ).json()["id"]
    tmpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x — mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    mine = client.post(
        "/api/v1/cycles/intelligent",
        json=_cycle_payload(cid, svc, tmpl, "agenda-own-1", "09:00:00"),
    )
    assert mine.status_code == 201, mine.text
    other_cycle = client.post(
        "/api/v1/cycles/intelligent",
        json=_cycle_payload(other, svc, tmpl, "agenda-other-1", "14:00:00"),
    )
    assert other_cycle.status_code == 201, other_cycle.text

    rows = list(
        db_session.scalars(
            select(Appointment).where(Appointment.cycle_id == UUID(mine.json()["id"]))
        ).all()
    )
    assert len(rows) >= 2
    first = rows[0]
    cancel = client.patch(
        f"/api/v1/appointments/{first.id}",
        json={"status": "cancelled"},
    )
    assert cancel.status_code == 200, cancel.text

    manual = client.post(
        "/api/v1/appointments",
        json={
            "client_id": cid,
            "starts_at": "2026-08-18T15:00:00-03:00",
            "ends_at": "2026-08-18T16:00:00-03:00",
        },
    )
    assert manual.status_code == 201, manual.text

    clone = Appointment(
        organization_id=rows[1].organization_id,
        client_id=rows[1].client_id,
        cycle_id=rows[1].cycle_id,
        service_id=rows[1].service_id,
        title=rows[1].title,
        starts_at=rows[1].starts_at,
        ends_at=rows[1].ends_at,
        status="scheduled",
        notes="duplicate-slot",
    )
    db_session.add(clone)
    db_session.commit()

    journey = client.get(f"/api/v1/clients/{cid}/journey").json()
    assert journey["accompaniment_checklist"]["cycle"] == "done"
    assert journey["accompaniment_checklist"]["agenda"] != "done"

    extra_done = Appointment(
        organization_id=rows[1].organization_id,
        client_id=rows[1].client_id,
        cycle_id=rows[1].cycle_id,
        service_id=rows[1].service_id,
        title=rows[1].title,
        starts_at=rows[1].starts_at.replace(year=2027, month=1, day=3, hour=6),
        ends_at=rows[1].ends_at.replace(year=2027, month=1, day=3, hour=7),
        status="completed",
    )
    extra_ns = Appointment(
        organization_id=rows[1].organization_id,
        client_id=rows[1].client_id,
        cycle_id=rows[1].cycle_id,
        service_id=rows[1].service_id,
        title=rows[1].title,
        starts_at=rows[1].starts_at.replace(year=2027, month=1, day=4, hour=6),
        ends_at=rows[1].ends_at.replace(year=2027, month=1, day=4, hour=7),
        status="no_show",
    )
    db_session.add_all([extra_done, extra_ns])
    db_session.commit()

    over = client.get(f"/api/v1/clients/{cid}/journey").json()
    assert over["accompaniment_checklist"]["agenda"] == "done"

    rows[1].status = "completed"
    db_session.add(rows[1])
    db_session.commit()
    still = client.get(f"/api/v1/clients/{cid}/journey").json()
    assert still["accompaniment_checklist"]["cycle"] == "done"
    assert still["accompaniment_checklist"]["agenda"] == "done"

