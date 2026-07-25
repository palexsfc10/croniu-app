from __future__ import annotations

from datetime import date, timedelta


def _auth(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    return response.json()


def test_client_service_cycle_receivable_flow(client, register_payload):
    _auth(client, register_payload)

    client_res = client.post(
        "/api/v1/clients",
        json={
            "full_name": "Aluno Demo",
            "phone": "11999990000",
            "email": "aluno.demo@example.com",
        },
    )
    assert client_res.status_code == 201
    client_id = client_res.json()["id"]

    service_res = client.post(
        "/api/v1/services",
        json={
            "name": "Mensal Personal",
            "default_duration_days": 30,
            "default_price_cents": 45000,
        },
    )
    assert service_res.status_code == 201
    service_id = service_res.json()["id"]

    starts = date.today()
    ends = starts + timedelta(days=5)
    cycle_res = client.post(
        "/api/v1/cycles",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "starts_on": starts.isoformat(),
            "ends_on": ends.isoformat(),
            "value_cents": 45000,
            "create_receivable": True,
        },
    )
    assert cycle_res.status_code == 201, cycle_res.text
    cycle = cycle_res.json()
    assert cycle["is_nearing_end"] is True
    cycle_id = cycle["id"]

    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200
    summary = home.json()
    assert len(summary["cycles_nearing_end"]) == 1
    assert len(summary["pending_payments"]) == 1
    assert summary["priority_action"]["kind"] == "cycle_nearing_end"

    prep = client.post(f"/api/v1/cycles/{cycle_id}/whatsapp-prep")
    assert prep.status_code == 200
    body = prep.json()
    assert "wa.me" in (body["wa_url"] or "")
    assert "renovação" in body["message"].lower() or "renovacao" in body["message"].lower()

    confirm = client.post(
        f"/api/v1/cycles/{cycle_id}/confirm-contact", json={"note": "Falou no zap"}
    )
    assert confirm.status_code == 200
    assert confirm.json()["contact_confirmed_at"] is not None

    receivables = client.get("/api/v1/receivables?status=pending")
    assert receivables.status_code == 200
    recv_id = receivables.json()[0]["id"]

    paid = client.post(
        f"/api/v1/receivables/{recv_id}/mark-paid",
        json={"payment_method": "pix"},
    )
    assert paid.status_code == 200
    assert paid.json()["status"] == "received"

    home2 = client.get("/api/v1/home/summary")
    assert home2.json()["pending_payments"] == []


def test_tenant_isolation_for_clients(client, register_payload):
    _auth(client, register_payload)
    created = client.post("/api/v1/clients", json={"full_name": "Cliente A"})
    assert created.status_code == 201
    client_id = created.json()["id"]
    cookie_a = client.cookies.get("croniu_session")

    other = {
        "email": "other_org@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro Pro",
        "organization_name": "Outro Studio",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201

    forbidden = client.get(f"/api/v1/clients/{client_id}")
    assert forbidden.status_code == 404

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    ok = client.get(f"/api/v1/clients/{client_id}")
    assert ok.status_code == 200
