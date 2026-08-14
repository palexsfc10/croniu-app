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
