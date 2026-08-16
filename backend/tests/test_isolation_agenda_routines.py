"""Tenant/client isolation, routines grouping, and agenda timezone consistency."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from app.models.intake import OperationalOccurrence
from app.models.appointment import Appointment
from fastapi.testclient import TestClient
from sqlalchemy import select


def _register(client: TestClient, payload: dict) -> dict:
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _seed_cycle(client: TestClient, *, client_id: str, starts_on: str, key: str) -> dict:
    svc = client.post(
        "/api/v1/services",
        json={
            "name": "Aula",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": 9000,
        },
    )
    tpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "3x semana",
            "weekly_frequency": 3,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": svc.json()["id"],
            "cycle_template_id": tpl.json()["id"],
            "starts_on": starts_on,
            "weekdays": [0, 2, 4],
            "starts_time": "14:00:00",
            "generate_appointments": True,
            "create_receivable": True,
            "idempotency_key": key,
        },
    )
    assert cycle.status_code == 201, cycle.text
    return cycle.json()


def test_one_client_two_occurrences_are_preserved(client, register_payload, db_session):
    a = _register(client, register_payload)
    org = a["organization"]["id"]
    created = client.post("/api/v1/clients", json={"full_name": "Murilo Macedo", "phone": "11911112222"})
    cid = created.json()["id"]
    db_session.add(
        OperationalOccurrence(
            organization_id=UUID(org),
            client_id=UUID(cid),
            occurrence_type="plan_review",
            status="open",
            due_on=date(2026, 8, 21),
            operational_date=date(2026, 8, 21),
            source="computed",
            idempotency_key="murilo-rev-aug",
        )
    )
    db_session.add(
        OperationalOccurrence(
            organization_id=UUID(org),
            client_id=UUID(cid),
            occurrence_type="plan_review",
            status="open",
            due_on=date(2026, 9, 21),
            operational_date=date(2026, 9, 21),
            source="computed",
            idempotency_key="murilo-rev-sep",
        )
    )
    db_session.commit()
    board = client.get(f"/api/v1/routines/board?client_id={cid}").json()
    group = next(g for g in board["groups"] if g["occurrence_type"] == "plan_review")
    assert group["occurrence_count"] == 2
    assert group["client_count"] == 1
    assert group["count"] == 2
    dues = sorted(i["due_on"] for i in group["items"])
    assert dues == ["2026-08-21", "2026-09-21"]
    first_id = next(i["id"] for i in group["items"] if i["due_on"] == "2026-08-21")
    second_id = next(i["id"] for i in group["items"] if i["due_on"] == "2026-09-21")
    done = client.post(
        f"/api/v1/routines/occurrences/{first_id}/decide",
        json={"status": "completed"},
    )
    assert done.status_code == 200
    after = client.get(f"/api/v1/routines/board?client_id={cid}").json()
    group2 = next(g for g in after["groups"] if g["occurrence_type"] == "plan_review")
    assert group2["occurrence_count"] == 1
    assert group2["items"][0]["id"] == second_id
    assert group2["items"][0]["due_on"] == "2026-09-21"


def test_cross_tenant_and_cross_client_isolation(client, register_payload, db_session):
    a = _register(client, register_payload)
    cookie_a = client.cookies.get("croniu_session")
    c1 = client.post("/api/v1/clients", json={"full_name": "Murilo Macedo", "phone": "11911112222"})
    c2 = client.post("/api/v1/clients", json={"full_name": "Ana Souza", "phone": "11933334444"})
    id_a1 = c1.json()["id"]
    id_a2 = c2.json()["id"]
    org_a = a["organization"]["id"]
    proto = client.post(
        "/api/v1/protocols",
        json={"client_id": id_a1, "title": "Plano Murilo", "protocol_type": "training"},
    )

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "b_" + register_payload["email"],
        "organization_name": "Studio B",
        "full_name": "Pro B",
    }
    b = _register(client, b_payload)
    cookie_b = client.cookies.get("croniu_session")
    c3 = client.post("/api/v1/clients", json={"full_name": "Cliente Outro Tenant", "phone": "11955556666"})
    id_b = c3.json()["id"]
    org_b = b["organization"]["id"]
    assert org_a != org_b

    assert client.get(f"/api/v1/clients/{id_a1}").status_code == 404
    assert client.get(f"/api/v1/routines/board?client_id={id_a1}").status_code == 404
    assert client.get("/api/v1/agenda/day").json()["appointments"] == []
    home_b = client.get("/api/v1/home/summary")
    assert home_b.json()["organization_id"] == org_b
    threads_b = client.get("/api/v1/agent/threads")
    assert threads_b.status_code == 200
    assert threads_b.json()["items"] == []

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_a)
    assert client.get(f"/api/v1/clients/{id_a1}").json()["full_name"] == "Murilo Macedo"
    assert client.get(f"/api/v1/clients/{id_b}").status_code == 404
    cycles_a1 = client.get(f"/api/v1/cycles?client_id={id_a1}")
    cycles_a2 = client.get(f"/api/v1/cycles?client_id={id_a2}")
    assert cycles_a1.status_code == 200
    assert cycles_a2.status_code == 200
    plans_a2 = client.get(f"/api/v1/protocols?client_id={id_a2}")
    assert plans_a2.status_code == 200
    if proto.status_code in {200, 201}:
        titles = [p.get("title") for p in plans_a2.json()]
        assert "Plano Murilo" not in titles

    today = date(2026, 8, 14)
    for idx, cid in enumerate([id_a1, id_a1, id_a2]):
        db_session.add(
            OperationalOccurrence(
                organization_id=UUID(org_a),
                client_id=UUID(cid),
                occurrence_type="plan_review",
                status="open",
                due_on=today + timedelta(days=idx),
                operational_date=today,
                source="computed",
                idempotency_key=f"test-{cid}-{idx}",
            )
        )
    db_session.commit()
    board = client.get("/api/v1/routines/board").json()
    group = next(g for g in board["groups"] if g["occurrence_type"] == "plan_review")
    assert group["client_count"] == 2
    assert group["occurrence_count"] == 3
    murilo_only = client.get(f"/api/v1/routines/board?client_id={id_a1}").json()
    g2 = next(g for g in murilo_only["groups"] if g["occurrence_type"] == "plan_review")
    assert g2["client_count"] == 1
    assert g2["occurrence_count"] == 2
    assert all(i["client_name"] == "Murilo Macedo" for i in g2["items"])

    client.cookies.clear()
    client.cookies.set("croniu_session", cookie_b)
    home = client.get("/api/v1/home/summary")
    names_home = " ".join(ap.get("client_name") or "" for ap in home.json().get("today_appointments", []))
    assert "Murilo" not in names_home
    nxt = client.get("/api/v1/agenda/next?after=2026-08-14")
    assert nxt.status_code == 200
    assert nxt.json()["appointment"] is None


def test_cycle_appointments_next_lesson_cancel_and_session(client, register_payload, db_session):
    body = _register(client, register_payload)
    email = body["user"]["email"]
    created = client.post("/api/v1/clients", json={"full_name": "Murilo Macedo", "phone": "11977778888"})
    client_id = created.json()["id"]
    cycle = _seed_cycle(client, client_id=client_id, starts_on="2026-08-17", key="cycle-consistency")
    lesson_count = cycle["lesson_count"]
    live = db_session.scalars(
        select(Appointment).where(
            Appointment.cycle_id == UUID(cycle["id"]),
            Appointment.status != "cancelled",
        )
    ).all()
    assert len(live) == lesson_count

    tz = ZoneInfo("America/Sao_Paulo")
    ordered = sorted(live, key=lambda row: row.starts_at)
    first = ordered[0]
    second = ordered[1]
    first_day = first.starts_at.astimezone(tz).date().isoformat()
    second_day = second.starts_at.astimezone(tz).date().isoformat()

    empty = client.get("/api/v1/agenda/day?day=2026-08-14")
    assert empty.json()["appointments"] == []
    nxt = client.get("/api/v1/agenda/next?after=2026-08-14")
    assert nxt.json()["date"] == first_day
    assert nxt.json()["appointment"]["client_name"] == "Murilo Macedo"

    filled = client.get(f"/api/v1/agenda/day?day={first_day}")
    assert any(a["id"] == str(first.id) for a in filled.json()["appointments"])

    cancel = client.patch(f"/api/v1/appointments/{first.id}", json={"status": "cancelled"})
    assert cancel.status_code == 200
    after_cancel = client.get(f"/api/v1/agenda/day?day={first_day}")
    assert after_cancel.json()["appointments"] == []
    shown = client.get(f"/api/v1/agenda/day?day={first_day}&include_cancelled=true")
    assert any(a["status"] == "cancelled" for a in shown.json()["appointments"])
    nxt2 = client.get("/api/v1/agenda/next?after=2026-08-14")
    assert nxt2.json()["date"] == second_day

    still = db_session.scalars(
        select(Appointment).where(
            Appointment.cycle_id == UUID(cycle["id"]),
            Appointment.status != "cancelled",
        )
    ).all()
    assert len(still) == lesson_count - 1

    client.post("/api/v1/auth/logout")
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "SenhaForte1!"})
    assert login.status_code == 200
    again = client.get(f"/api/v1/agenda/day?day={second_day}")
    assert any(a["id"] == str(second.id) for a in again.json()["appointments"])
    home = client.get("/api/v1/home/summary")
    assert home.json()["organization_id"] == body["organization"]["id"]


def test_agenda_day_boundary_sao_paulo(client, register_payload, db_session):
    _register(client, register_payload)
    org = client.get("/api/v1/auth/me").json()["organization"]["id"]
    created = client.post("/api/v1/clients", json={"full_name": "Jonh Future", "phone": "11900001111"})
    client_id = created.json()["id"]
    boundary = datetime(2026, 8, 15, 2, 30, tzinfo=ZoneInfo("UTC"))
    db_session.add(
        Appointment(
            organization_id=UUID(org),
            client_id=UUID(client_id),
            starts_at=boundary,
            ends_at=boundary.replace(hour=3, minute=30),
            status="scheduled",
            title="Limite de dia",
        )
    )
    db_session.commit()
    on_14 = client.get("/api/v1/agenda/day?day=2026-08-14")
    on_15 = client.get("/api/v1/agenda/day?day=2026-08-15")
    assert "Limite de dia" in [a.get("title") for a in on_14.json()["appointments"]]
    assert "Limite de dia" not in [a.get("title") for a in on_15.json()["appointments"]]
