"""Cycle ↔ agenda integrity: programmed active cycles always materialize appointments."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from app.agent.tools import ToolContext, execute_create_cycle, get_tool
from app.db import SessionLocal
from app.models.appointment import Appointment
from app.services import agenda as agenda_svc
from app.services import cycle_schedule as sched
from app.services.auth import AuthError
from fastapi.testclient import TestClient
from sqlalchemy import select


def _recent_past_monday() -> date:
    local_today = datetime.now(UTC).astimezone(
        ZoneInfo("America/Sao_Paulo")
    ).date()
    days_since_monday = local_today.weekday()
    return local_today - timedelta(days=days_since_monday or 7)


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _me(client: TestClient) -> tuple[UUID, UUID]:
    me = client.get("/api/v1/auth/me").json()
    return UUID(me["organization"]["id"]), UUID(me["user"]["id"])


def _seed(client: TestClient, *, weekly_frequency: int = 3) -> dict:
    c = client.post(
        "/api/v1/clients",
        json={"full_name": "Jonh doe", "phone": "11988887777"},
    )
    assert c.status_code == 201, c.text
    s = client.post(
        "/api/v1/services",
        json={
            "name": "Aula padrão",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": 9000,
        },
    )
    assert s.status_code == 201, s.text
    t = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": f"{weekly_frequency}x semana — mensal",
            "weekly_frequency": weekly_frequency,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert t.status_code == 201, t.text
    return {
        "client_id": c.json()["id"],
        "service_id": s.json()["id"],
        "template_id": t.json()["id"],
    }


def test_rejects_generate_appointments_false(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    res = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-06",
            "weekdays": [0, 2],
            "starts_time": "17:00:00",
            "generate_appointments": False,
            "idempotency_key": "no-skip-agenda",
        },
    )
    assert res.status_code == 422
    assert client.get("/api/v1/cycles").json() == []


def test_rejects_missing_starts_time(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    res = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-06",
            "weekdays": [0, 2],
            "idempotency_key": "no-time",
        },
    )
    assert res.status_code == 422
    assert client.get("/api/v1/cycles").json() == []


def test_john_like_thu_start_mon_wed_twelve_lessons_no_aug06(client, register_payload):
    """Regression: starts_on Thursday with Mon–Wed schedule → first lesson Mon 10/08.

    Agenda on 06/08 correctly has no occurrence for this client; cycle still has 12 appts.
    """
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=3)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-06",
            "weekdays": [0, 1, 2],
            "starts_time": "17:00:00",
            "create_receivable": True,
            "idempotency_key": "john-like-aug06",
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["lesson_count"] == 12
    assert cycle["lessons_remaining"] == 12
    assert cycle["starts_on"] == "2026-08-06"
    assert cycle["ends_on"] == "2026-09-06"

    day_start = client.get("/api/v1/agenda/day", params={"day": "2026-08-06"})
    assert day_start.status_code == 200
    assert day_start.json()["appointments"] == []

    first = client.get("/api/v1/agenda/day", params={"day": "2026-08-10"})
    assert first.status_code == 200
    appts = first.json()["appointments"]
    assert len(appts) == 1
    assert appts[0]["cycle_id"] == cycle["id"]
    assert appts[0]["status"] == "scheduled"
    starts = datetime.fromisoformat(appts[0]["starts_at"])
    local = starts.astimezone(ZoneInfo("America/Sao_Paulo"))
    assert local.date() == date(2026, 8, 10)
    assert local.hour == 17
    assert local.minute == 0

    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        linked = list(
            db.scalars(
                select(Appointment).where(
                    Appointment.organization_id == org_id,
                    Appointment.cycle_id == UUID(cycle["id"]),
                )
            ).all()
        )
        assert len(linked) == 12
        assert all(a.status == "scheduled" for a in linked)
        local_days = sorted(
            {a.starts_at.astimezone(ZoneInfo("America/Sao_Paulo")).date() for a in linked}
        )
        assert local_days[0] == date(2026, 8, 10)
        assert date(2026, 8, 6) not in local_days
    finally:
        db.close()


def test_start_on_programmed_weekday_includes_first_day(client, register_payload):
    """When starts_on falls on a programmed weekday, first appointment is that day."""
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=3)
    bad = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-06",
            "weekdays": [3, 5],
            "starts_time": "17:00:00",
            "idempotency_key": "thu-on-start-bad",
        },
    )
    assert bad.status_code == 422

    t2 = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x qui-sab",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert t2.status_code == 201
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": t2.json()["id"],
            "starts_on": "2026-08-06",
            "weekdays": [3, 5],
            "starts_time": "17:00:00",
            "idempotency_key": "thu-on-start-ok",
        },
    )
    assert created.status_code == 201, created.text
    day = client.get("/api/v1/agenda/day", params={"day": "2026-08-06"})
    assert day.status_code == 200
    rows = day.json()["appointments"]
    assert len(rows) == 1
    assert rows[0]["cycle_id"] == created.json()["id"]
    assert rows[0]["status"] == "scheduled"
    local = datetime.fromisoformat(rows[0]["starts_at"]).astimezone(
        ZoneInfo("America/Sao_Paulo")
    )
    assert local.date() == date(2026, 8, 6)
    assert local.hour == 17


def test_past_day_agenda_still_lists_scheduled(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    start_day = _recent_past_monday()
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": start_day.isoformat(),
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "idempotency_key": "past-day-agenda",
        },
    )
    assert created.status_code == 201, created.text
    cycle_id = created.json()["id"]
    day = client.get("/api/v1/agenda/day", params={"day": start_day.isoformat()})
    assert day.status_code == 200
    rows = day.json()["appointments"]
    assert len(rows) == 1
    assert rows[0]["cycle_id"] == cycle_id
    assert rows[0]["status"] == "scheduled"


def test_cancelled_hidden_unless_include_cancelled(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    start_day = _recent_past_monday()
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": start_day.isoformat(),
            "weekdays": [0, 2],
            "starts_time": "10:00:00",
            "idempotency_key": "cancel-filter",
        },
    )
    assert created.status_code == 201, created.text
    appt_id = client.get("/api/v1/agenda/day", params={"day": start_day.isoformat()}).json()[
        "appointments"
    ][0]["id"]
    cancel = client.patch(
        f"/api/v1/appointments/{appt_id}",
        json={"status": "cancelled"},
    )
    assert cancel.status_code == 200, cancel.text
    hidden = client.get("/api/v1/agenda/day", params={"day": start_day.isoformat()})
    assert hidden.json()["appointments"] == []
    shown = client.get(
        "/api/v1/agenda/day",
        params={"day": start_day.isoformat(), "include_cancelled": "true"},
    )
    assert len(shown.json()["appointments"]) == 1
    assert shown.json()["appointments"][0]["status"] == "cancelled"


def test_ai_create_cycle_requires_schedule_and_materializes(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(
            organization_id=org_id,
            user_id=user_id,
            db=db,
            today=date(2026, 8, 6),
        )
        try:
            execute_create_cycle(
                ctx,
                {
                    "client_id": ids["client_id"],
                    "service_id": ids["service_id"],
                    "starts_on": "2026-08-06",
                    "weekdays": [],
                    "starts_time": "17:00",
                    "duration_type": "calendar_months",
                    "duration_value": 1,
                    "cycle_template_id": ids["template_id"],
                    "idempotency_key": "ai-no-weekdays",
                },
            )
            raise AssertionError("expected schedule_required")
        except AuthError as exc:
            assert exc.code == "schedule_required"

        try:
            execute_create_cycle(
                ctx,
                {
                    "client_id": ids["client_id"],
                    "service_id": ids["service_id"],
                    "starts_on": "2026-08-06",
                    "weekdays": [0, 2],
                    "duration_type": "calendar_months",
                    "duration_value": 1,
                    "cycle_template_id": ids["template_id"],
                    "idempotency_key": "ai-no-time",
                },
            )
            raise AssertionError("expected schedule_required")
        except AuthError as exc:
            assert exc.code == "schedule_required"

        propose = get_tool("propose_create_cycle").handler(
            ctx,
            {
                "client_id": ids["client_id"],
                "service_id": ids["service_id"],
                "starts_on": "2026-08-06",
                "weekdays": [0, 2],
                "starts_time": "17:00",
                "generate_appointments": True,
                "duration_type": "calendar_months",
                "duration_value": 1,
                "cycle_template_id": ids["template_id"],
                "create_receivable": True,
                "idempotency_key": "ai-ok-sched",
            },
        )
        out = execute_create_cycle(ctx, propose["arguments"])
        assert out["appointment_count"] == out["lesson_count"]
        assert out["appointment_count"] >= 1
        again = execute_create_cycle(ctx, propose["arguments"])
        assert again["id"] == out["id"]
        linked = list(
            db.scalars(
                select(Appointment).where(
                    Appointment.organization_id == org_id,
                    Appointment.cycle_id == UUID(out["id"]),
                )
            ).all()
        )
        assert len(linked) == out["appointment_count"]
    finally:
        db.close()


def test_conflict_leaves_no_active_cycle(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    org_id, _ = _me(client)
    tz = ZoneInfo("America/Sao_Paulo")
    start = sched.local_dt(date(2026, 8, 10), time(17, 0), tz)
    conflict_db = SessionLocal()
    try:
        agenda_svc.create_appointment(
            conflict_db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            starts_at=start,
            ends_at=start + timedelta(hours=1),
        )
    finally:
        conflict_db.close()
    res = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-06",
            "weekdays": [0, 2],
            "starts_time": "17:00:00",
            "idempotency_key": "conflict-no-orphan",
        },
    )
    assert res.status_code == 409
    assert res.json()["code"] == "SCHEDULE_CONFLICT"
    assert client.get("/api/v1/cycles").json() == []


def test_org_isolation_agenda_day(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    start_day = _recent_past_monday()
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": start_day.isoformat(),
            "weekdays": [0, 2],
            "starts_time": "11:00:00",
            "idempotency_key": "iso-a",
        },
    )
    assert created.status_code == 201
    client.post("/api/v1/auth/logout")
    other = {
        "email": "iso_agenda@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio",
    }
    _auth(client, other)
    day = client.get("/api/v1/agenda/day", params={"day": start_day.isoformat()})
    assert day.json()["appointments"] == []


def test_schedule_service_rejects_generate_false(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, weekly_frequency=2)
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        try:
            sched.create_cycle_with_schedule(
                db,
                organization_id=org_id,
                client_id=UUID(ids["client_id"]),
                service_id=UUID(ids["service_id"]),
                starts_on=date(2026, 8, 6),
                weekdays=[0, 2],
                starts_time="17:00",
                duration_type="calendar_months",
                duration_value=1,
                cycle_template_id=UUID(ids["template_id"]),
                idempotency_key="svc-no-gen",
                generate_appointments=False,
            )
            raise AssertionError("expected agenda_required")
        except AuthError as exc:
            assert exc.code == "agenda_required"
    finally:
        db.close()
