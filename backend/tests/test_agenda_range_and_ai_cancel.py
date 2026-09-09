"""Fatia 5 (Agenda) additions — all additive, zero migration, zero schema
change:
- GET /agenda/range: powers the desktop Week view by looping the already-
  proven list_day_agenda() per day, so conflict/cancelled/routine logic
  stays identical to /agenda/day.
- propose_cancel_appointment / execute_cancel_appointment: the one AI
  write-action missing for the "Cancele o compromisso das 14h." command —
  every other agenda AI command (create/reschedule/query availability)
  already existed before this fatia.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.agent.tools import ToolContext, execute_cancel_appointment, get_tool
from app.db import SessionLocal


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _create_client(client, name="Aluna Range", phone="11999990000"):
    res = client.post("/api/v1/clients", json={"full_name": name, "phone": phone})
    assert res.status_code == 201, res.text
    return res.json()


def _today(client) -> date:
    local_today = client.get("/api/v1/organization/preferences").json()["local_today"]
    y, m, d = (int(part) for part in local_today.split("-"))
    return date(y, m, d)


def _create_appointment(client, *, client_id, starts_at, ends_at):
    res = client.post(
        "/api/v1/appointments",
        json={"client_id": client_id, "starts_at": starts_at, "ends_at": ends_at},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _me(client) -> tuple[uuid.UUID, uuid.UUID]:
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


# --- GET /agenda/range -------------------------------------------------


def test_agenda_range_returns_one_entry_per_day_in_order(client, register_payload):
    _register(client, register_payload)
    today = _today(client)
    end = today + timedelta(days=6)
    res = client.get(f"/api/v1/agenda/range?start_date={today}&end_date={end}")
    assert res.status_code == 200
    body = res.json()
    assert body["timezone"]
    assert [d["date"] for d in body["days"]] == [
        (today + timedelta(days=i)).isoformat() for i in range(7)
    ]
    assert all(d["appointments"] == [] for d in body["days"])


def test_agenda_range_places_appointment_on_the_right_local_day(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    target = today + timedelta(days=2)
    appt = _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{target}T09:00:00-03:00",
        ends_at=f"{target}T10:00:00-03:00",
    )

    res = client.get(f"/api/v1/agenda/range?start_date={today}&end_date={today + timedelta(days=6)}")
    assert res.status_code == 200
    by_date = {d["date"]: d for d in res.json()["days"]}
    ids_on_target = [a["id"] for a in by_date[target.isoformat()]["appointments"]]
    assert appt["id"] in ids_on_target
    for iso, day in by_date.items():
        if iso != target.isoformat():
            assert appt["id"] not in [a["id"] for a in day["appointments"]]


def test_agenda_range_excludes_cancelled_unless_requested(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    appt = _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{today}T11:00:00-03:00",
        ends_at=f"{today}T12:00:00-03:00",
    )
    cancel = client.patch(f"/api/v1/appointments/{appt['id']}", json={"status": "cancelled"})
    assert cancel.status_code == 200

    hidden = client.get(f"/api/v1/agenda/range?start_date={today}&end_date={today}")
    assert hidden.json()["days"][0]["appointments"] == []

    shown = client.get(
        f"/api/v1/agenda/range?start_date={today}&end_date={today}&include_cancelled=true"
    )
    ids = [a["id"] for a in shown.json()["days"][0]["appointments"]]
    assert appt["id"] in ids


def test_agenda_range_rejects_end_before_start(client, register_payload):
    _register(client, register_payload)
    today = _today(client)
    res = client.get(f"/api/v1/agenda/range?start_date={today}&end_date={today - timedelta(days=1)}")
    assert res.status_code == 422
    assert res.json()["code"] == "invalid_range"


def test_agenda_range_rejects_span_over_limit(client, register_payload):
    _register(client, register_payload)
    today = _today(client)
    res = client.get(f"/api/v1/agenda/range?start_date={today}&end_date={today + timedelta(days=40)}")
    assert res.status_code == 400
    assert res.json()["code"] == "date_range_limited"


def test_agenda_range_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{today}T13:00:00-03:00",
        ends_at=f"{today}T14:00:00-03:00",
    )

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "rangeb_" + register_payload["email"],
        "organization_name": "Studio B Range",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    res = client.get(f"/api/v1/agenda/range?start_date={today}&end_date={today}")
    assert res.status_code == 200
    assert res.json()["days"][0]["appointments"] == []


# --- AI: propose_cancel_appointment / execute_cancel_appointment -------


def test_cancel_tool_registered_as_write_requiring_confirmation():
    tool = get_tool("propose_cancel_appointment")
    assert tool.kind == "write"
    assert tool.requires_confirmation is True


def test_propose_cancel_appointment_summarizes_client_and_time(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Ana Cancelamento")
    today = _today(client)
    appt = _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{today}T14:00:00-03:00",
        ends_at=f"{today}T15:00:00-03:00",
    )

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("propose_cancel_appointment").handler(
            ctx, {"appointment_id": appt["id"]}
        )
        assert result["needs_confirmation"] is True
        assert "Ana Cancelamento" in result["summary"]
        assert result["arguments"]["appointment_id"] == appt["id"]
    finally:
        db.close()


def test_execute_cancel_appointment_sets_status_cancelled(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Gabriel Cancelamento")
    today = _today(client)
    appt = _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{today}T16:00:00-03:00",
        ends_at=f"{today}T17:00:00-03:00",
    )

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = execute_cancel_appointment(ctx, {"appointment_id": appt["id"]})
        assert result["status"] == "cancelled"
        db.commit()
    finally:
        db.close()

    fetched = client.get(f"/api/v1/appointments/{appt['id']}")
    assert fetched.json()["status"] == "cancelled"


def test_propose_cancel_already_cancelled_is_rejected(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Carla Cancelamento")
    today = _today(client)
    appt = _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{today}T18:00:00-03:00",
        ends_at=f"{today}T19:00:00-03:00",
    )
    assert client.patch(
        f"/api/v1/appointments/{appt['id']}", json={"status": "cancelled"}
    ).status_code == 200

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        try:
            get_tool("propose_cancel_appointment").handler(ctx, {"appointment_id": appt["id"]})
            raised = False
        except Exception as exc:  # AuthError
            raised = True
            assert getattr(exc, "code", None) == "already_cancelled"
        assert raised
    finally:
        db.close()


def test_cancel_appointment_tool_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Cliente Org A")
    today = _today(client)
    appt = _create_appointment(
        client,
        client_id=person["id"],
        starts_at=f"{today}T20:00:00-03:00",
        ends_at=f"{today}T21:00:00-03:00",
    )

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "cancelb_" + register_payload["email"],
        "organization_name": "Studio B Cancel",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    org_b_id, user_b_id = _me(client)

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_b_id, user_id=user_b_id, db=db)
        try:
            get_tool("propose_cancel_appointment").handler(ctx, {"appointment_id": appt["id"]})
            raised = False
        except Exception:
            raised = True
        assert raised
    finally:
        db.close()
