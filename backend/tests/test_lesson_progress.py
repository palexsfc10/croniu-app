"""Lesson progress: completed/no_show consume cycle lesson balance."""

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


def _seed_cycle(client: TestClient, key: str) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Aluno Contagem", "phone": "11988887777"}
    ).json()["id"]
    service_id = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_price_cents": 9000,
            "default_duration_minutes": 60,
        },
    ).json()["id"]
    template_id = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Mensal 2x",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": "2026-08-03",
            "weekdays": [0, 2],
            "idempotency_key": key,
            "generate_appointments": True,
            "starts_time": "09:00",
        },
    )
    assert cycle.status_code == 201, cycle.text
    body = cycle.json()
    return {
        "client_id": client_id,
        "cycle_id": body["id"],
        "lesson_count": body["lesson_count"],
    }


def test_completed_and_no_show_consume_lessons(client: TestClient, register_payload: dict):
    _auth(client, register_payload)
    seed = _seed_cycle(client, "lesson-progress-1")
    cycle_id = seed["cycle_id"]
    total = seed["lesson_count"]
    assert total and total >= 2

    before = client.get(f"/api/v1/cycles/{cycle_id}").json()
    assert before["lessons_completed"] == 0
    assert before["lessons_remaining"] == total

    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    # Appointment linked to cycle
    a1 = client.post(
        "/api/v1/appointments",
        json={
            "client_id": seed["client_id"],
            "cycle_id": cycle_id,
            "starts_at": f"{day}T10:00:00-03:00",
            "ends_at": f"{day}T11:00:00-03:00",
        },
    )
    assert a1.status_code == 201, a1.text
    done = client.patch(
        f"/api/v1/appointments/{a1.json()['id']}",
        json={"status": "completed"},
    )
    assert done.status_code == 200
    assert done.json()["status"] == "completed"

    mid = client.get(f"/api/v1/cycles/{cycle_id}").json()
    assert mid["lessons_completed"] == 1
    assert mid["lessons_remaining"] == total - 1

    a2 = client.post(
        "/api/v1/appointments",
        json={
            "client_id": seed["client_id"],
            "cycle_id": cycle_id,
            "starts_at": f"{day}T14:00:00-03:00",
            "ends_at": f"{day}T15:00:00-03:00",
        },
    ).json()
    assert (
        client.patch(
            f"/api/v1/appointments/{a2['id']}",
            json={"status": "no_show"},
        ).status_code
        == 200
    )

    after = client.get(f"/api/v1/cycles/{cycle_id}").json()
    assert after["lessons_completed"] == 2
    assert after["lessons_remaining"] == total - 2


def test_cancelled_appointment_does_not_consume(client: TestClient, register_payload: dict):
    _auth(client, register_payload)
    seed = _seed_cycle(client, "lesson-progress-2")
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": seed["client_id"],
            "cycle_id": seed["cycle_id"],
            "starts_at": f"{day}T16:00:00-03:00",
            "ends_at": f"{day}T17:00:00-03:00",
        },
    ).json()
    assert (
        client.patch(
            f"/api/v1/appointments/{created['id']}",
            json={"status": "cancelled"},
        ).status_code
        == 200
    )
    cycle = client.get(f"/api/v1/cycles/{seed['cycle_id']}").json()
    assert cycle["lessons_completed"] == 0
    assert cycle["lessons_remaining"] == seed["lesson_count"]
