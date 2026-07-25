from __future__ import annotations


def _auth_client(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    return client


def _create_client(client, name="Aluno Agenda"):
    response = client.post(
        "/api/v1/clients",
        json={"full_name": name, "phone": "11999990000"},
    )
    assert response.status_code == 201
    return response.json()


def _create_location(client, name="Academia Centro"):
    response = client.post(
        "/api/v1/locations",
        json={"name": name, "address": "Rua A, 100"},
    )
    assert response.status_code == 201
    return response.json()


def test_org_timezone_default(client, register_payload):
    _auth_client(client, register_payload)
    prefs = client.get("/api/v1/organization/preferences")
    assert prefs.status_code == 200
    body = prefs.json()
    assert body["timezone"] == "America/Sao_Paulo"
    assert body["local_today"]


def test_org_timezone_valid_and_invalid(client, register_payload):
    _auth_client(client, register_payload)
    ok = client.patch(
        "/api/v1/organization/preferences",
        json={"timezone": "America/Manaus"},
    )
    assert ok.status_code == 200
    assert ok.json()["timezone"] == "America/Manaus"

    bad = client.patch(
        "/api/v1/organization/preferences",
        json={"timezone": "Not/AZone"},
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "invalid_timezone"


def test_location_crud_and_archive(client, register_payload):
    _auth_client(client, register_payload)
    created = _create_location(client)
    listed = client.get("/api/v1/locations")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    patched = client.patch(
        f"/api/v1/locations/{created['id']}",
        json={"name": "Parque", "status": "archived"},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "archived"
    assert client.get("/api/v1/locations").json() == []
    archived = client.get("/api/v1/locations?status=archived")
    assert len(archived.json()) == 1


def test_location_invalid_url(client, register_payload):
    _auth_client(client, register_payload)
    response = client.post(
        "/api/v1/locations",
        json={"name": "Online", "meeting_url": "not-a-url"},
    )
    assert response.status_code == 422


def test_appointment_create_and_day_agenda(client, register_payload):
    _auth_client(client, register_payload)
    person = _create_client(client)
    location = _create_location(client)
    prefs = client.get("/api/v1/organization/preferences").json()
    day = prefs["local_today"]
    starts = f"{day}T14:00:00-03:00"
    ends = f"{day}T15:00:00-03:00"
    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "location_id": location["id"],
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "scheduled"
    assert body["client_name"] == person["full_name"]

    agenda = client.get(f"/api/v1/agenda/day?day={day}")
    assert agenda.status_code == 200
    assert len(agenda.json()["appointments"]) == 1


def test_appointment_consecutive_allowed_overlap_blocked(client, register_payload):
    _auth_client(client, register_payload)
    person = _create_client(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    first = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T09:00:00-03:00",
            "ends_at": f"{day}T10:00:00-03:00",
        },
    )
    assert first.status_code == 201

    consecutive = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T10:00:00-03:00",
            "ends_at": f"{day}T11:00:00-03:00",
        },
    )
    assert consecutive.status_code == 201

    conflict = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T09:30:00-03:00",
            "ends_at": f"{day}T10:30:00-03:00",
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "appointment_conflict"
    assert conflict.json()["details"]["conflicts"]


def test_cancelled_ignored_in_conflict(client, register_payload):
    _auth_client(client, register_payload)
    person = _create_client(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    first = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T16:00:00-03:00",
            "ends_at": f"{day}T17:00:00-03:00",
        },
    ).json()
    cancel = client.patch(
        f"/api/v1/appointments/{first['id']}",
        json={"status": "cancelled"},
    )
    assert cancel.status_code == 200

    again = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T16:00:00-03:00",
            "ends_at": f"{day}T17:00:00-03:00",
        },
    )
    assert again.status_code == 201


def test_appointment_edit_ignores_self(client, register_payload):
    _auth_client(client, register_payload)
    person = _create_client(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T12:00:00-03:00",
            "ends_at": f"{day}T13:00:00-03:00",
        },
    ).json()
    edited = client.patch(
        f"/api/v1/appointments/{created['id']}",
        json={
            "starts_at": f"{day}T12:15:00-03:00",
            "ends_at": f"{day}T13:15:00-03:00",
        },
    )
    assert edited.status_code == 200


def test_appointment_result_and_invalid_interval(client, register_payload):
    _auth_client(client, register_payload)
    person = _create_client(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    created = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T18:00:00-03:00",
            "ends_at": f"{day}T19:00:00-03:00",
        },
    ).json()
    done = client.patch(
        f"/api/v1/appointments/{created['id']}",
        json={"status": "completed"},
    )
    assert done.status_code == 200
    assert done.json()["status"] == "completed"

    bad = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "starts_at": f"{day}T20:00:00-03:00",
            "ends_at": f"{day}T19:00:00-03:00",
        },
    )
    assert bad.status_code == 422


def test_home_summary_includes_appointments(client, register_payload):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    _auth_client(client, register_payload)
    person = _create_client(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    # Priority: in-progress or starting within 2h — avoid fixed 22:00 (fails after 23h).
    tz = ZoneInfo("America/Sao_Paulo")
    now_local = datetime.now(tz)
    start = now_local + timedelta(minutes=30)
    if start.date().isoformat() != day:
        start = now_local - timedelta(minutes=15)
    end = start + timedelta(hours=1)
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
    assert body["timezone"] == "America/Sao_Paulo"
    assert len(body["today_appointments"]) >= 1
    assert body["priority_action"] is not None


def test_tenant_isolation_location_and_appointment(client, register_payload):
    a = client.post("/api/v1/auth/register", json=register_payload)
    assert a.status_code == 201
    person = _create_client(client)
    location = _create_location(client)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    appt = client.post(
        "/api/v1/appointments",
        json={
            "client_id": person["id"],
            "location_id": location["id"],
            "starts_at": f"{day}T08:00:00-03:00",
            "ends_at": f"{day}T09:00:00-03:00",
        },
    ).json()
    cookie_a = client.cookies.get("croniu_session")

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Outra Org Agenda",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201

    assert client.get(f"/api/v1/locations/{location['id']}").status_code == 404
    assert client.get(f"/api/v1/appointments/{appt['id']}").status_code == 404

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    assert client.get(f"/api/v1/appointments/{appt['id']}").status_code == 200


def test_cross_tenant_client_rejected(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    person = _create_client(client)
    client_id = person["id"]

    other = {
        **register_payload,
        "email": f"b_{register_payload['email']}",
        "organization_name": "Org B",
    }
    client.cookies.clear()
    client.post("/api/v1/auth/register", json=other)
    day = client.get("/api/v1/organization/preferences").json()["local_today"]
    response = client.post(
        "/api/v1/appointments",
        json={
            "client_id": client_id,
            "starts_at": f"{day}T07:00:00-03:00",
            "ends_at": f"{day}T08:00:00-03:00",
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == "client_not_found"


def test_me_includes_timezone(client, register_payload):
    reg = client.post("/api/v1/auth/register", json=register_payload)
    assert reg.status_code == 201
    assert reg.json()["organization"]["timezone"] == "America/Sao_Paulo"
