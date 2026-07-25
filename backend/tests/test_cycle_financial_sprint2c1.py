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


def _cycle_720(client: TestClient, register_payload: dict, *, key: str) -> dict:
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
            "name": "2x mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    loc = client.post("/api/v1/locations", json={"name": "Sala A"}).json()["id"]
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "generate_appointments": True,
            "starts_time": "09:00:00",
            "location_id": loc,
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["value_cents"] == 72000
    return {
        "cycle_id": created.json()["id"],
        "client_id": client_id,
        "service_id": service_id,
    }


def test_financial_discount_updates_pending(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-disc-1")
    before_appts = client.get("/api/v1/agenda/day", params={"day": "2026-08-04"}).json()[
        "appointments"
    ]
    assert len(before_appts) == 1

    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/financial",
        json={"adjustment_cents": -6000, "notes": "Cortesia"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["subtotal_cents"] == 72000
    assert body["adjustment_cents"] == -6000
    assert body["value_cents"] == 66000
    assert body["unit_price_cents"] == 9000

    recv = client.get("/api/v1/receivables").json()
    assert len(recv) == 1
    assert recv[0]["amount_cents"] == 66000
    assert recv[0]["status"] == "pending"

    after_appts = client.get("/api/v1/agenda/day", params={"day": "2026-08-04"}).json()[
        "appointments"
    ]
    assert len(after_appts) == 1
    assert after_appts[0]["id"] == before_appts[0]["id"]
    assert after_appts[0]["starts_at"] == before_appts[0]["starts_at"]


def test_financial_final_derives_adjustment(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-final-1")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/financial",
        json={"final_cents": 65000},
    )
    assert res.status_code == 200, res.text
    assert res.json()["adjustment_cents"] == -7000
    assert res.json()["value_cents"] == 65000


def test_financial_positive_adjustment(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-plus-1")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/financial",
        json={"final_cents": 75000},
    )
    assert res.status_code == 200
    assert res.json()["adjustment_cents"] == 3000


def test_financial_rejects_both_fields(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-both-1")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/financial",
        json={"final_cents": 66000, "adjustment_cents": -6000},
    )
    assert res.status_code == 422


def test_financial_blocks_received(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-recv-1")
    recv_id = client.get("/api/v1/receivables").json()[0]["id"]
    assert client.post(f"/api/v1/receivables/{recv_id}/mark-paid", json={}).status_code == 200
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/financial",
        json={"final_cents": 50000},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "payment_confirmed"
    assert "confirmado" in res.json()["message"].lower()
    assert client.get(f"/api/v1/receivables/{recv_id}").json()["amount_cents"] == 72000
    assert client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()["value_cents"] == 72000


def test_snapshot_unit_price_rejected_on_intelligent(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-snap-1")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"unit_price_cents": 5000},
    )
    assert res.status_code == 422
    assert res.json()["code"] == "snapshot_immutable"


def test_financial_tenant_isolation(client, register_payload):
    ids = _cycle_720(client, register_payload, key="fin-iso-a")
    cycle_id = ids["cycle_id"]
    client.post("/api/v1/auth/logout")
    other = {
        "email": "fin_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Studio Outro",
    }
    _register(client, other)
    res = client.patch(
        f"/api/v1/cycles/{cycle_id}/financial",
        json={"final_cents": 100},
    )
    assert res.status_code == 404
