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
