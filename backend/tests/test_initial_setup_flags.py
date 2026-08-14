from __future__ import annotations


def _auth(client, register_payload):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    return response.json()


def test_home_setup_flags_empty_org(client, register_payload):
    _auth(client, register_payload)
    home = client.get("/api/v1/home/summary").json()
    assert home["has_active_service"] is False
    assert home["has_active_cycle_template"] is False
    assert home["message"] == "Sua rotina ainda está sendo configurada."


def test_home_setup_flags_service_only_and_archived_ignored(client, register_payload):
    _auth(client, register_payload)
    created = client.post(
        "/api/v1/services",
        json={
            "name": "Aula individual",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": None,
        },
    )
    assert created.status_code == 201
    home = client.get("/api/v1/home/summary").json()
    assert home["has_active_service"] is True
    assert home["has_active_cycle_template"] is False

    archived = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Arquivado",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert archived.status_code == 201
    tid = archived.json()["id"]
    client.patch(f"/api/v1/cycle-templates/{tid}", json={"status": "archived"})
    home2 = client.get("/api/v1/home/summary").json()
    assert home2["has_active_cycle_template"] is False

    client.patch(f"/api/v1/services/{created.json()['id']}", json={"status": "archived"})
    home3 = client.get("/api/v1/home/summary").json()
    assert home3["has_active_service"] is False


def test_home_setup_complete_and_tenant_isolation(client, register_payload):
    _auth(client, register_payload)
    client.post(
        "/api/v1/services",
        json={
            "name": "Sessão",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
        },
    )
    client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Mensal",
            "weekly_frequency": 1,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    home = client.get("/api/v1/home/summary").json()
    assert home["has_active_service"] is True
    assert home["has_active_cycle_template"] is True
    assert home["message"] != "Sua rotina ainda está sendo configurada."
    cookie_a = client.cookies.get("croniu_session")

    client.cookies.clear()
    payload_b = {
        **register_payload,
        "email": "setup_b_" + register_payload["email"],
        "organization_name": "Org B Setup",
    }
    assert client.post("/api/v1/auth/register", json=payload_b).status_code == 201
    home_b = client.get("/api/v1/home/summary").json()
    assert home_b["has_active_service"] is False
    assert home_b["has_active_cycle_template"] is False

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    home_a = client.get("/api/v1/home/summary").json()
    assert home_a["has_active_service"] is True
    assert home_a["has_active_cycle_template"] is True
