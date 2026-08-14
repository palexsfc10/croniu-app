"""Renewal approval creates cycle once and preserves starts_on."""

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


def _seed(client: TestClient, key: str) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Renata Silva", "phone": "11988887777"}
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
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": "2026-07-01",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    return {
        "client_id": client_id,
        "service_id": service_id,
        "template_id": template_id,
        "cycle_id": created.json()["id"],
    }


def test_renewal_approve_creates_one_cycle_and_is_idempotent(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, "ren-appr-seed")
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    assert client.post(f"/api/v1/public/my-cycle/{token}/renewal").status_code == 200
    renewals = client.get("/api/v1/renewal-requests").json()
    assert len(renewals) == 1
    rid = renewals[0]["id"]
    before = len(client.get("/api/v1/cycles").json())
    body = {
        "client_id": ids["client_id"],
        "service_id": ids["service_id"],
        "cycle_template_id": ids["template_id"],
        "starts_on": "2026-09-01",
        "weekdays": [1, 3],
        "starts_time": "10:00:00",
        "idempotency_key": "approve-once",
        "renewal_request_id": rid,
        "generate_appointments": True,
    }
    created = client.post("/api/v1/cycles/intelligent", json=body)
    assert created.status_code == 201, created.text
    assert created.json()["starts_on"] == "2026-09-01"
    after = client.get("/api/v1/cycles").json()
    assert len(after) == before + 1
    again = client.post(
        "/api/v1/cycles/intelligent",
        json={**body, "idempotency_key": "approve-again"},
    )
    assert again.status_code == 201, again.text
    assert again.json()["id"] == created.json()["id"]
    assert len(client.get("/api/v1/cycles").json()) == before + 1
    source = client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()
    assert source["status"] == "ended"
    home = client.get("/api/v1/home/summary").json()
    assert not any(
        item["entity_id"] == ids["cycle_id"] for item in home["attention_items"]
    )


def test_renewal_same_slot_excludes_source_but_keeps_external_conflicts(
    client, register_payload
):
    """Approve renewal at the same weekly slot as the source cycle.

    Source future appointments must not 409 the renewal (they are cancelled on
    resolve). A third-party appointment at that slot must still 409.
    """
    from datetime import datetime, timedelta

    _auth(client, register_payload)
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Renata Silva", "phone": "11988887777"}
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
            "name": "1x mensal",
            "weekly_frequency": 1,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    day = datetime.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    ).date()
    starts_near_end = (day - timedelta(days=25)).isoformat()
    source = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": starts_near_end,
            "weekdays": [0],
            "starts_time": "09:00:00",
            "idempotency_key": "ren-overlap-source",
            "generate_appointments": True,
        },
    )
    assert source.status_code == 201, source.text
    source_id = source.json()["id"]

    token = client.post(f"/api/v1/clients/{client_id}/public-access").json()["token"]
    renew = client.post(f"/api/v1/public/my-cycle/{token}/renewal")
    assert renew.status_code == 200, renew.text
    rid = client.get("/api/v1/renewal-requests").json()[0]["id"]

    # Same weekday/time overlapping remaining source Mondays after tomorrow.
    starts = (day + timedelta(days=1)).isoformat()
    ok = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": starts,
            "weekdays": [0],
            "starts_time": "09:00:00",
            "idempotency_key": "ren-overlap-approve",
            "renewal_request_id": rid,
            "generate_appointments": True,
        },
    )
    assert ok.status_code == 201, ok.text
    assert client.get(f"/api/v1/cycles/{source_id}").json()["status"] == "ended"

    # Fresh org: external blocker must still conflict (no renewal exclusion).
    client.cookies.clear()
    other_payload = {
        **register_payload,
        "email": f"ext_{register_payload['email']}",
        "organization_name": "Studio Ext Conflict",
    }
    assert client.post("/api/v1/auth/register", json=other_payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={
                "email": other_payload["email"],
                "password": other_payload["password"],
            },
        ).status_code
        == 200
    )
    a = client.post(
        "/api/v1/clients", json={"full_name": "Cliente A", "phone": "11911112222"}
    ).json()["id"]
    b = client.post(
        "/api/v1/clients", json={"full_name": "Cliente B", "phone": "11933334444"}
    ).json()["id"]
    svc = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_price_cents": 9000,
            "default_duration_minutes": 60,
        },
    ).json()["id"]
    tmpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "1x",
            "weekly_frequency": 1,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    assert (
        client.post(
            "/api/v1/cycles/intelligent",
            json={
                "client_id": a,
                "service_id": svc,
                "cycle_template_id": tmpl,
                "starts_on": starts,
                "weekdays": [0],
                "starts_time": "09:00:00",
                "idempotency_key": "ext-blocker",
                "generate_appointments": True,
            },
        ).status_code
        == 201
    )
    blocked = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": b,
            "service_id": svc,
            "cycle_template_id": tmpl,
            "starts_on": starts,
            "weekdays": [0],
            "starts_time": "09:00:00",
            "idempotency_key": "ext-victim",
            "generate_appointments": True,
        },
    )
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["code"] == "SCHEDULE_CONFLICT"
