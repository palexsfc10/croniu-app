"""Renewal case state machine: awaiting-client, end-without-renewal, renewed,
derived overdue, cancelled-cycle exclusion, and tenant isolation."""

from __future__ import annotations

from datetime import date, datetime, timedelta

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


def _today(client: TestClient):
    return datetime.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    ).date()


def _seed_cycle(client: TestClient, *, key: str, starts_on: str, duration_days: int) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Renata Silva", "phone": "11988887777"}
    ).json()["id"]
    service_id = client.post(
        "/api/v1/services",
        json={"name": "Personal", "default_price_cents": 9000, "default_duration_minutes": 60},
    ).json()["id"]
    template_id = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": f"tmpl-{key}",
            "weekly_frequency": 1,
            "duration_type": "fixed_days",
            "duration_value": duration_days,
        },
    ).json()["id"]
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": starts_on,
            "weekdays": [date.fromisoformat(starts_on).weekday()],
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


def _find(views: list[dict], cycle_id: str) -> dict | None:
    return next((v for v in views if v["source_cycle_id"] == cycle_id), None)


def test_mark_awaiting_client_requires_next_contact_date_and_shows_in_list(
    client, register_payload
):
    _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(
        client, key="await-1", starts_on=today.isoformat(), duration_days=5
    )
    cid = ids["cycle_id"]

    missing = client.post(f"/api/v1/renewal-cases/{cid}/awaiting-client", json={})
    assert missing.status_code == 422

    ok = client.post(
        f"/api/v1/renewal-cases/{cid}/awaiting-client",
        json={"next_contact_date": (today + timedelta(days=3)).isoformat()},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["display_status"] == "awaiting_client"
    assert ok.json()["next_contact_date"] == (today + timedelta(days=3)).isoformat()

    needs_decision = client.get("/api/v1/renewal-cases").json()
    row = _find(needs_decision, cid)
    assert row is not None
    assert row["display_status"] == "awaiting_client"


def test_end_without_renewal_requires_valid_reason_and_excludes_from_needs_decision(
    client, register_payload
):
    _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, key="end-1", starts_on=today.isoformat(), duration_days=5)
    cid = ids["cycle_id"]

    bad = client.post(
        f"/api/v1/renewal-cases/{cid}/end-without-renewal",
        json={"resolution_reason": "not_a_real_reason"},
    )
    assert bad.status_code == 422

    ok = client.post(
        f"/api/v1/renewal-cases/{cid}/end-without-renewal",
        json={"resolution_reason": "client_declined", "resolution_note": "Mudou de cidade"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["display_status"] == "ended_without_renewal"
    assert ok.json()["resolution_reason"] == "client_declined"
    assert ok.json()["resolution_note"] == "Mudou de cidade"

    needs_decision = client.get("/api/v1/renewal-cases").json()
    assert _find(needs_decision, cid) is None
    full = client.get("/api/v1/renewal-cases?scope=all").json()
    row = _find(full, cid)
    assert row is not None and row["display_status"] == "ended_without_renewal"

    # A closed case cannot be reopened via either action.
    again = client.post(
        f"/api/v1/renewal-cases/{cid}/awaiting-client",
        json={"next_contact_date": today.isoformat()},
    )
    assert again.status_code == 409


def test_renewed_from_cycle_id_ends_source_links_successor_and_is_idempotent(
    client, register_payload
):
    _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, key="renew-src", starts_on=today.isoformat(), duration_days=5)
    source_id = ids["cycle_id"]

    before = len(client.get("/api/v1/cycles").json())
    body = {
        "client_id": ids["client_id"],
        "service_id": ids["service_id"],
        "cycle_template_id": ids["template_id"],
        "starts_on": (today + timedelta(days=5)).isoformat(),
        "weekdays": [(today + timedelta(days=5)).weekday()],
        "starts_time": "10:00:00",
        "idempotency_key": "renew-succ-1",
        "renewed_from_cycle_id": source_id,
    }
    created = client.post("/api/v1/cycles/intelligent", json=body)
    assert created.status_code == 201, created.text
    successor_id = created.json()["id"]
    assert len(client.get("/api/v1/cycles").json()) == before + 1

    source = client.get(f"/api/v1/cycles/{source_id}").json()
    assert source["status"] == "ended"

    full = client.get("/api/v1/renewal-cases?scope=all").json()
    row = _find(full, source_id)
    assert row is not None
    assert row["display_status"] == "renewed"
    assert row["successor_cycle_id"] == successor_id

    # Retry (e.g. double-click with a fresh idempotency key) must not create
    # a second cycle — it returns the same successor.
    retry = client.post(
        "/api/v1/cycles/intelligent",
        json={**body, "idempotency_key": "renew-succ-2"},
    )
    assert retry.status_code == 201, retry.text
    assert retry.json()["id"] == successor_id
    assert len(client.get("/api/v1/cycles").json()) == before + 1


def test_overdue_is_derived_never_persisted_as_its_own_status(client, register_payload):
    _auth(client, register_payload)
    today = _today(client)
    # Ends 3 days ago, never touched by the professional.
    ids = _seed_cycle(
        client,
        key="overdue-1",
        starts_on=(today - timedelta(days=10)).isoformat(),
        duration_days=7,
    )
    cid = ids["cycle_id"]

    full = client.get("/api/v1/renewal-cases?scope=all").json()
    row = _find(full, cid)
    assert row is not None
    assert row["display_status"] == "overdue"
    # No case was ever created for a purely date-derived state.
    assert row["case_id"] is None

    needs_decision = client.get("/api/v1/renewal-cases").json()
    assert _find(needs_decision, cid) is not None


def test_cancelled_cycle_never_appears_in_renewal_cases(client, register_payload):
    _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(
        client, key="cancel-1", starts_on=today.isoformat(), duration_days=3
    )
    cid = ids["cycle_id"]
    assert client.post(f"/api/v1/cycles/{cid}/cancel").status_code == 200

    full = client.get("/api/v1/renewal-cases?scope=all").json()
    assert _find(full, cid) is None
    needs_decision = client.get("/api/v1/renewal-cases").json()
    assert _find(needs_decision, cid) is None

    # Acting on a cancelled cycle's renewal is rejected outright.
    resp = client.post(
        f"/api/v1/renewal-cases/{cid}/awaiting-client",
        json={"next_contact_date": today.isoformat()},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "cycle_cancelled"


def test_portal_renewal_request_flags_the_case_without_marking_it_renewed(
    client, register_payload
):
    _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(
        client, key="portal-1", starts_on=today.isoformat(), duration_days=5
    )
    cid = ids["cycle_id"]
    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    assert client.post(f"/api/v1/public/my-cycle/{token}/renewal").status_code == 200

    full = client.get("/api/v1/renewal-cases?scope=all").json()
    row = _find(full, cid)
    assert row is not None
    assert row["portal_requested"] is True
    # A portal request alone is a signal, never a resolution.
    assert row["display_status"] in {"pending", "upcoming", "awaiting_client", "overdue"}


def test_renewal_cases_are_isolated_per_organization(client, register_payload):
    _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, key="tenant-a", starts_on=today.isoformat(), duration_days=5)
    cid = ids["cycle_id"]

    client.cookies.clear()
    other_payload = {
        **register_payload,
        "email": f"ext_{register_payload['email']}",
        "organization_name": "Studio Ext Renewals",
    }
    _auth(client, other_payload)

    # Org B cannot see or act on org A's cycle.
    full = client.get("/api/v1/renewal-cases?scope=all").json()
    assert _find(full, cid) is None
    forbidden = client.post(
        f"/api/v1/renewal-cases/{cid}/awaiting-client",
        json={"next_contact_date": today.isoformat()},
    )
    assert forbidden.status_code == 404
