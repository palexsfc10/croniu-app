"""New read-only endpoints backing the Clientes list + Cliente 360° slice:
GET /clients/{id}/appointments, GET /clients/{id}/receivables,
GET /agenda/next-appointments. All additive — no schema change."""

from __future__ import annotations


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _create_client(client, name="Aluna Teste", phone="11999990000"):
    res = client.post("/api/v1/clients", json={"full_name": name, "phone": phone})
    assert res.status_code == 201, res.text
    return res.json()


def _seed_cycle_with_appointments_and_receivable(
    client, *, client_id, starts_on, key, starts_time="14:00:00"
):
    """Mirrors the proven pattern in test_isolation_agenda_routines.py:
    an intelligent cycle with generate_appointments + create_receivable
    produces real appointment and receivable rows to assert against.
    `starts_time` is overridable so two clients seeded in the same test
    don't collide on the same org-wide appointment slot."""
    svc = client.post(
        "/api/v1/services",
        json={
            "name": "Aula",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": 9000,
        },
    )
    assert svc.status_code == 201, svc.text
    tpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "3x semana",
            "weekly_frequency": 3,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert tpl.status_code == 201, tpl.text
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": svc.json()["id"],
            "cycle_template_id": tpl.json()["id"],
            "starts_on": starts_on,
            "weekdays": [0, 2, 4],
            "starts_time": starts_time,
            "generate_appointments": True,
            "create_receivable": True,
            "idempotency_key": key,
        },
    )
    assert cycle.status_code == 201, cycle.text
    return cycle.json()


def _tomorrow(client) -> str:
    from datetime import date, timedelta

    today = client.get("/api/v1/organization/preferences").json()["local_today"]
    y, m, d = (int(part) for part in today.split("-"))
    return (date(y, m, d) + timedelta(days=1)).isoformat()


def test_client_appointments_lists_upcoming_ordered(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    starts_on = _tomorrow(client)
    _seed_cycle_with_appointments_and_receivable(
        client, client_id=person["id"], starts_on=starts_on, key="key-k1"
    )

    res = client.get(f"/api/v1/clients/{person['id']}/appointments")
    assert res.status_code == 200
    items = res.json()
    assert len(items) > 0
    assert all(item["client_id"] == person["id"] for item in items)
    starts = [item["starts_at"] for item in items]
    assert starts == sorted(starts)


def test_client_appointments_respects_limit(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    starts_on = _tomorrow(client)
    _seed_cycle_with_appointments_and_receivable(
        client, client_id=person["id"], starts_on=starts_on, key="key-k2"
    )

    res = client.get(f"/api/v1/clients/{person['id']}/appointments?limit=2")
    assert res.status_code == 200
    assert len(res.json()) <= 2


def test_client_appointments_404_for_unknown_client(client, register_payload):
    _register(client, register_payload)
    res = client.get("/api/v1/clients/00000000-0000-0000-0000-000000000000/appointments")
    assert res.status_code == 404


def test_client_receivables_lists_real_amounts(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    starts_on = _tomorrow(client)
    _seed_cycle_with_appointments_and_receivable(
        client, client_id=person["id"], starts_on=starts_on, key="key-k3"
    )

    res = client.get(f"/api/v1/clients/{person['id']}/receivables")
    assert res.status_code == 200
    items = res.json()
    assert len(items) > 0
    assert all(item["client_id"] == person["id"] for item in items)
    assert all(isinstance(item["amount_cents"], int) and item["amount_cents"] > 0 for item in items)


def test_client_receivables_404_for_unknown_client(client, register_payload):
    _register(client, register_payload)
    res = client.get("/api/v1/clients/00000000-0000-0000-0000-000000000000/receivables")
    assert res.status_code == 404


def test_agenda_next_appointments_batched_across_clients(client, register_payload):
    _register(client, register_payload)
    a = _create_client(client, name="Aluna A", phone="11911110000")
    b = _create_client(client, name="Aluna B", phone="11922220000")
    starts_on = _tomorrow(client)
    _seed_cycle_with_appointments_and_receivable(
        client, client_id=a["id"], starts_on=starts_on, key="key-ka"
    )
    _seed_cycle_with_appointments_and_receivable(
        client, client_id=b["id"], starts_on=starts_on, key="key-kb", starts_time="16:00:00"
    )

    res = client.get("/api/v1/agenda/next-appointments")
    assert res.status_code == 200
    body = res.json()
    assert a["id"] in body
    assert b["id"] in body
    assert body[a["id"]]["client_id"] == a["id"]
    assert body[b["id"]]["client_id"] == b["id"]


def test_agenda_next_appointments_omits_client_with_no_upcoming(client, register_payload):
    _register(client, register_payload)
    lonely = _create_client(client, name="Sem Agenda", phone="11933330000")

    res = client.get("/api/v1/agenda/next-appointments")
    assert res.status_code == 200
    assert lonely["id"] not in res.json()


def test_new_client_endpoints_isolated_by_tenant(client, register_payload):
    a = _register(client, register_payload)
    person_a = _create_client(client, name="Cliente A")
    starts_on = _tomorrow(client)
    _seed_cycle_with_appointments_and_receivable(
        client, client_id=person_a["id"], starts_on=starts_on, key="key-kiso"
    )
    cookie_a = client.cookies.get("croniu_session")

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "b_" + register_payload["email"],
        "organization_name": "Studio B Isolamento",
        "full_name": "Pro B",
    }
    _register(client, b_payload)

    # Org B must never see org A's client via the new per-client routes.
    assert client.get(f"/api/v1/clients/{person_a['id']}/appointments").status_code == 404
    assert client.get(f"/api/v1/clients/{person_a['id']}/receivables").status_code == 404
    # Org B's batch next-appointments must never include org A's client.
    assert person_a["id"] not in client.get("/api/v1/agenda/next-appointments").json()

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    assert client.get(f"/api/v1/clients/{person_a['id']}/appointments").status_code == 200
    assert client.get(f"/api/v1/clients/{person_a['id']}/receivables").status_code == 200
    assert person_a["id"] in client.get("/api/v1/agenda/next-appointments").json()
