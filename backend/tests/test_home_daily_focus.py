from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def _auth(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    return response.json()


def _create_client(client, name="Cliente Home"):
    response = client.post(
        "/api/v1/clients",
        json={"full_name": name, "phone": "11988887777"},
    )
    assert response.status_code == 201
    return response.json()


def _create_service(client):
    response = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_duration_days": 30,
            "default_price_cents": 40000,
        },
    )
    assert response.status_code == 201
    return response.json()


def test_home_priority_upcoming_appointment_over_cycle(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Mariana")
    service = _create_service(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    now_local = datetime.now(tz)
    start = now_local + timedelta(minutes=40)
    end = start + timedelta(hours=1)

    cycle = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": day,
            "ends_on": (datetime.fromisoformat(day).date() + timedelta(days=2)).isoformat(),
            "value_cents": 40000,
            "create_receivable": False,
        },
    )
    assert cycle.status_code == 201

    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    assert created.status_code == 201

    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200
    body = home.json()
    assert body["priority_action"]["kind"] in {
        "appointment_upcoming",
        "appointment_in_progress",
    }
    assert body["contextual_hint"] is None
    assert "upcoming_appointments" in body
    assert len(body["upcoming_appointments"]) >= 1
    assert body["priority_action"]["cta_label"] == "Ver compromisso"


def test_home_past_appointment_needs_outcome_not_upcoming(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Carlos")
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    now_local = datetime.now(tz)
    # Ensure a past slot still on local today
    start = now_local.replace(hour=6, minute=0, second=0, microsecond=0)
    if start.date().isoformat() != day:
        start = now_local - timedelta(hours=3)
    end = start + timedelta(hours=1)
    if end >= now_local:
        start = now_local - timedelta(hours=2)
        end = start + timedelta(minutes=30)

    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    appt_id = created.json()["id"]

    home = client.get("/api/v1/home/summary").json()
    upcoming_ids = {item["id"] for item in home["upcoming_appointments"]}
    needing = {item["id"] for item in home["appointments_needing_outcome"]}
    assert appt_id not in upcoming_ids
    assert appt_id in needing
    kinds = {item["kind"] for item in home["attention_items"]}
    assert "appointment_needs_outcome" in kinds
    if home["priority_action"]:
        assert home["priority_action"]["kind"] != "appointment_upcoming" or home[
            "priority_action"
        ]["entity_id"] != appt_id


def test_home_renewal_request_outranks_cycle_nearing(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Pedro Xavier")
    service = _create_service(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    ends = (datetime.fromisoformat(day).date() + timedelta(days=3)).isoformat()
    cycle = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": day,
            "ends_on": ends,
            "value_cents": 40000,
            "create_receivable": False,
        },
    ).json()

    # Portal renewal request
    access = client.post(f"/api/v1/clients/{person['id']}/public-access")
    assert access.status_code in {200, 201}, access.text
    token = access.json()["token"]
    req = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    assert req.status_code == 200, req.text

    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"]["kind"] == "renewal_requested"
    assert home["priority_action"]["cta_label"] == "Revisar solicitação"
    # Dedup: same cycle should not appear as generic nearing attention
    cycle_attention = [
        item
        for item in home["attention_items"]
        if item["kind"] == "cycle_nearing_end" and item["entity_id"] == cycle["id"]
    ]
    assert cycle_attention == []
    renewal_attention = [
        item for item in home["attention_items"] if item["kind"] == "renewal_requested"
    ]
    assert len(renewal_attention) == 1
    assert home["contextual_hint"] is None


def test_home_empty_day_message(client, register_payload):
    _auth(client, register_payload)
    home = client.get("/api/v1/home/summary").json()
    assert home["priority_action"] is None
    assert home["attention_items"] == []
    assert home["upcoming_appointments"] == []
    assert home["contextual_hint"] is None
    assert "pendência" in home["message"].lower() or "organizado" in home["message"].lower()


def test_home_summary_tenant_isolation(client, register_payload):
    _auth(client, register_payload)
    person = _create_client(client, "Privado A")
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    tz = ZoneInfo("America/Sao_Paulo")
    start = datetime.now(tz) + timedelta(hours=1)
    end = start + timedelta(hours=1)
    appt = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": start.isoformat(),
            "ends_at": end.isoformat(),
        },
    ).json()
    cookie_a = client.cookies.get("croniu_session")

    other = {
        **register_payload,
        "email": f"home_other_{register_payload['email']}",
        "organization_name": "Org Home B",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    home_b = client.get("/api/v1/home/summary").json()
    ids_b = {item["id"] for item in home_b["today_appointments"]}
    assert appt["id"] not in ids_b

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    home_a = client.get("/api/v1/home/summary").json()
    ids_a = {item["id"] for item in home_a["today_appointments"]}
    assert appt["id"] in ids_a
