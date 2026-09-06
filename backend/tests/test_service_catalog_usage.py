"""GET /services/usage — real catalog counters, never inflated.

Guards the exact definitions in `app.services.catalog_usage`: a cycle left at
"active" past its own ends_on is elapsed (not running), cancelled cycles are
excluded entirely, and counters never leak across organizations.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _service(client, name="Aula padrão"):
    res = client.post(
        "/api/v1/services",
        json={"name": name, "default_price_cents": 9000, "default_duration_minutes": 60},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _client_row(client, name):
    res = client.post("/api/v1/clients", json={"full_name": name})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _cycle(client, *, client_id, service_id, starts_on, ends_on, value_cents=9000):
    """Legacy period cycle — creates no appointments, so these tests stay about
    counting contracts and never depend on agenda conflict rules."""
    res = client.post(
        "/api/v1/cycles",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "starts_on": starts_on.isoformat(),
            "ends_on": ends_on.isoformat(),
            "value_cents": value_cents,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _usage_for(client, service_id):
    res = client.get("/api/v1/services/usage")
    assert res.status_code == 200, res.text
    for row in res.json():
        if row["service_id"] == service_id:
            return row
    return None


def test_service_with_no_cycles_is_absent_from_usage(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    assert _usage_for(client, service_id) is None


def test_running_cycle_counts_as_running_and_as_a_client(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    client_id = _client_row(client, "Ana")
    today = date.today()
    _cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        starts_on=today - timedelta(days=5),
        ends_on=today + timedelta(days=25),
    )
    usage = _usage_for(client, service_id)
    assert usage == {
        "service_id": service_id,
        "running_cycles": 1,
        "total_cycles": 1,
        "distinct_clients": 1,
    }


def test_cycle_left_active_past_its_end_is_not_counted_as_running(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    client_id = _client_row(client, "Bruno")
    today = date.today()
    _cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        starts_on=today - timedelta(days=90),
        ends_on=today - timedelta(days=30),
    )
    usage = _usage_for(client, service_id)
    assert usage["running_cycles"] == 0
    # It still happened, so history keeps it.
    assert usage["total_cycles"] == 1
    assert usage["distinct_clients"] == 1


def test_future_cycle_is_history_but_not_yet_running(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    client_id = _client_row(client, "Carla")
    today = date.today()
    _cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        starts_on=today + timedelta(days=10),
        ends_on=today + timedelta(days=40),
    )
    usage = _usage_for(client, service_id)
    assert usage["running_cycles"] == 0
    assert usage["total_cycles"] == 1


def test_cancelled_cycle_is_excluded_from_every_counter(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    client_id = _client_row(client, "Diego")
    today = date.today()
    cycle_id = _cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        starts_on=today - timedelta(days=5),
        ends_on=today + timedelta(days=25),
    )
    assert client.post(f"/api/v1/cycles/{cycle_id}/cancel").status_code == 200
    assert _usage_for(client, service_id) is None


def test_two_cycles_for_the_same_client_count_once_as_a_client(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    client_id = _client_row(client, "Elisa")
    today = date.today()
    _cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        starts_on=today - timedelta(days=90),
        ends_on=today - timedelta(days=60),
    )
    _cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        starts_on=today - timedelta(days=5),
        ends_on=today + timedelta(days=25),
    )
    usage = _usage_for(client, service_id)
    assert usage["total_cycles"] == 2
    assert usage["running_cycles"] == 1
    assert usage["distinct_clients"] == 1


def test_usage_is_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    service_a = _service(client, name="Serviço Org A")
    client_a = _client_row(client, "Cliente Org A")
    today = date.today()
    _cycle(
        client,
        client_id=client_a,
        service_id=service_a,
        starts_on=today - timedelta(days=5),
        ends_on=today + timedelta(days=25),
    )
    client.post("/api/v1/auth/logout")

    suffix = uuid.uuid4().hex[:8]
    _register(
        client,
        {
            "email": f"other_{suffix}@example.com",
            "password": "SenhaForte1!",
            "full_name": "Outra Profissional",
            "organization_name": f"Outro Studio {suffix}",
        },
    )
    res = client.get("/api/v1/services/usage")
    assert res.status_code == 200
    assert res.json() == []
    assert _usage_for(client, service_a) is None
