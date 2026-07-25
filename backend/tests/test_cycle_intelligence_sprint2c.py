from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, payload: dict) -> None:
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text


def _login(client: TestClient, email: str, password: str) -> None:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text


def _setup_org(client: TestClient, register_payload: dict) -> dict:
    _register(client, register_payload)
    _login(client, register_payload["email"], register_payload["password"])
    client_res = client.post(
        "/api/v1/clients",
        json={"full_name": "Ana Souza", "phone": "11999990000"},
    )
    assert client_res.status_code == 201
    service_res = client.post(
        "/api/v1/services",
        json={
            "name": "Personal presencial",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": 9000,
        },
    )
    assert service_res.status_code == 201, service_res.text
    template_res = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x por semana — mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert template_res.status_code == 201, template_res.text
    return {
        "client_id": client_res.json()["id"],
        "service_id": service_res.json()["id"],
        "template_id": template_res.json()["id"],
    }


def test_service_has_duration_minutes(client, register_payload):
    _register(client, register_payload)
    _login(client, register_payload["email"], register_payload["password"])
    res = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_price_cents": 9000,
            "default_duration_minutes": 60,
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["default_duration_minutes"] == 60
    assert body["default_price_cents"] == 9000


def test_preview_and_create_with_discount(client, register_payload):
    ids = _setup_org(client, register_payload)
    preview = client.post(
        "/api/v1/cycles/preview",
        json={
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "adjustment_cents": -6000,
        },
    )
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["lesson_count"] == 8
    assert data["subtotal_cents"] == 72000
    assert data["final_cents"] == 66000
    assert data["ends_on"] == "2026-09-01"

    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "adjustment_cents": -6000,
            "create_receivable": True,
            "idempotency_key": "idem-cycle-001",
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["is_legacy"] is False
    assert cycle["lesson_count"] == 8
    assert cycle["value_cents"] == 66000
    assert cycle["unit_price_cents"] == 9000

    recv = client.get("/api/v1/receivables")
    assert recv.status_code == 200
    items = recv.json()
    assert len(items) == 1
    assert items[0]["amount_cents"] == 66000
    assert items[0]["status"] == "pending"

    # idempotency
    again = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "adjustment_cents": -6000,
            "idempotency_key": "idem-cycle-001",
        },
    )
    assert again.status_code == 201
    assert again.json()["id"] == cycle["id"]
    assert len(client.get("/api/v1/receivables").json()) == 1


def test_price_change_does_not_alter_snapshot(client, register_payload):
    ids = _setup_org(client, register_payload)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "idempotency_key": "snap-price-1",
        },
    )
    assert created.status_code == 201
    cycle_id = created.json()["id"]
    assert created.json()["unit_price_cents"] == 9000

    patch = client.patch(
        f"/api/v1/services/{ids['service_id']}",
        json={"default_price_cents": 12000},
    )
    assert patch.status_code == 200
    got = client.get(f"/api/v1/cycles/{cycle_id}")
    assert got.json()["unit_price_cents"] == 9000
    assert got.json()["value_cents"] == 72000


def test_generate_appointments_atomic_conflict(client, register_payload):
    ids = _setup_org(client, register_payload)
    # Block first lesson slot (Tue 2026-08-04 09:00)
    blocker = client.post(
        "/api/v1/appointments",
        json={
            "client_id": ids["client_id"],
            "starts_at": "2026-08-04T09:00:00-03:00",
            "ends_at": "2026-08-04T10:00:00-03:00",
        },
    )
    assert blocker.status_code == 201, blocker.text

    res = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "generate_appointments": True,
            "starts_time": "09:00:00",
            "create_receivable": True,
            "idempotency_key": "conflict-1",
        },
    )
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "appointment_conflict"
    assert client.get("/api/v1/cycles").json() == []
    assert client.get("/api/v1/receivables").json() == []
    appts = client.get("/api/v1/agenda/day", params={"day": "2026-08-04"})
    # only the blocker
    assert len(appts.json()["appointments"]) == 1


def test_generate_appointments_success(client, register_payload):
    ids = _setup_org(client, register_payload)
    loc = client.post("/api/v1/locations", json={"name": "Academia Centro"})
    assert loc.status_code == 201
    res = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "generate_appointments": True,
            "starts_time": "09:00:00",
            "location_id": loc.json()["id"],
            "idempotency_key": "gen-ok-1",
        },
    )
    assert res.status_code == 201, res.text
    cycle_id = res.json()["id"]
    day = client.get("/api/v1/agenda/day", params={"day": "2026-08-04"})
    assert day.status_code == 200
    assert len(day.json()["appointments"]) == 1
    assert day.json()["appointments"][0]["cycle_id"] == cycle_id


def test_tenant_isolation_template(client, register_payload):
    ids = _setup_org(client, register_payload)
    template_id = ids["template_id"]
    client.post("/api/v1/auth/logout")

    other = {
        "email": "other_2c@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio",
    }
    _register(client, other)
    _login(client, other["email"], other["password"])
    res = client.get(f"/api/v1/cycle-templates/{template_id}")
    assert res.status_code == 404


def test_paid_receivable_not_silently_changed(client, register_payload):
    ids = _setup_org(client, register_payload)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "idempotency_key": "paid-guard-1",
        },
    )
    cycle_id = created.json()["id"]
    recv_id = client.get("/api/v1/receivables").json()[0]["id"]
    paid = client.post(f"/api/v1/receivables/{recv_id}/mark-paid", json={})
    assert paid.status_code == 200

    upd = client.patch(
        f"/api/v1/cycles/{cycle_id}/intelligent",
        json={"final_cents": 50000},
    )
    assert upd.status_code == 409
    assert upd.json()["code"] == "payment_confirmed"
    # receivable stays received with original amount
    recv = client.get(f"/api/v1/receivables/{recv_id}")
    assert recv.json()["status"] == "received"
    assert recv.json()["amount_cents"] == 72000
    assert client.get(f"/api/v1/cycles/{cycle_id}").json()["value_cents"] == 72000
