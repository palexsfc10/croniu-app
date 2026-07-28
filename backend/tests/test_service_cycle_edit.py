"""Cancel cycle soft-delete and legacy notes edit."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _create_cycle(client: TestClient, register_payload: dict, *, key: str) -> dict:
    _register(client, register_payload)
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Ana Souza", "phone": "11999990000"}
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
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": "2026-08-03",
            "weekdays": [0, 2],
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def test_cancel_cycle_marks_cancelled(client: TestClient, register_payload: dict):
    cycle = _create_cycle(client, register_payload, key="cancel-1")
    response = client.delete(f"/api/v1/cycles/{cycle['id']}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "cancelled"
    listed = client.get("/api/v1/cycles").json()
    assert any(row["id"] == cycle["id"] and row["status"] == "cancelled" for row in listed)


def test_cancel_cycle_is_idempotent(client: TestClient, register_payload: dict):
    cycle = _create_cycle(client, register_payload, key="cancel-2")
    first = client.post(f"/api/v1/cycles/{cycle['id']}/cancel")
    second = client.delete(f"/api/v1/cycles/{cycle['id']}")
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "cancelled"


def test_patch_service_archive(client: TestClient, register_payload: dict):
    _register(client, register_payload)
    created = client.post(
        "/api/v1/services",
        json={
            "name": "Pilates",
            "default_price_cents": 8000,
            "default_duration_minutes": 50,
        },
    )
    assert created.status_code == 201
    service_id = created.json()["id"]
    patched = client.patch(
        f"/api/v1/services/{service_id}",
        json={"name": "Pilates Solo", "status": "archived"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Pilates Solo"
    assert patched.json()["status"] == "archived"
    active = client.get("/api/v1/services?status=active").json()
    assert all(row["id"] != service_id for row in active)


def test_patch_cycle_template_edit_and_archive(client: TestClient, register_payload: dict):
    _register(client, register_payload)
    created = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert created.status_code == 201
    template_id = created.json()["id"]
    edited = client.patch(
        f"/api/v1/cycle-templates/{template_id}",
        json={"name": "3x mensal", "weekly_frequency": 3},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["name"] == "3x mensal"
    assert edited.json()["weekly_frequency"] == 3
    archived = client.patch(
        f"/api/v1/cycle-templates/{template_id}",
        json={"status": "archived"},
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    active = client.get("/api/v1/cycle-templates?status=active").json()
    assert all(row["id"] != template_id for row in active)
