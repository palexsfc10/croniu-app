"""Cycle schedule: occurrences, conflicts, atomic create with agenda."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from app.db import SessionLocal
from app.services import agenda as agenda_svc
from app.services import cycle_schedule as sched
from app.services.auth import AuthError
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


def _me(client: TestClient) -> tuple[UUID, UUID]:
    me = client.get("/api/v1/auth/me").json()
    return UUID(me["organization"]["id"]), UUID(me["user"]["id"])


def _seed(client: TestClient) -> dict:
    c = client.post(
        "/api/v1/clients",
        json={"full_name": "Gabriel Silva", "phone": "11999990001"},
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
            "name": "Aula padrão",
            "weekly_frequency": 2,
            "duration_type": "fixed_days",
            "duration_value": 30,
        },
    )
    assert t.status_code == 201, t.text
    return {
        "client_id": c.json()["id"],
        "service_id": s.json()["id"],
        "template_id": t.json()["id"],
    }


def test_build_eight_occurrences_midweek_start():
    # Fri 2026-08-07 start, exclusive end 2026-09-06 → Tue/Thu slots
    slots = [
        sched.ScheduleSlot(1, time(18, 30)),  # Tuesday
        sched.ScheduleSlot(3, time(20, 0)),  # Thursday
    ]
    tz = ZoneInfo("America/Sao_Paulo")
    occ = sched.build_occurrences(
        starts_on=date(2026, 8, 7),
        ends_on=date(2026, 9, 6),
        slots=slots,
        duration_minutes=60,
        tz=tz,
    )
    assert len(occ) == 8
    assert occ[0].day == date(2026, 8, 11)  # first Tuesday on/after Fri 7
    assert occ[0].starts_at.astimezone(tz).hour == 18
    # Different times per weekday
    thurs = [o for o in occ if o.weekday == 3]
    assert thurs[0].starts_at.astimezone(tz).hour == 20


def test_partial_overlap_conflicts_and_adjacent_ok(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id, _ = _me(client)
    tz = ZoneInfo("America/Sao_Paulo")
    day = date(2026, 8, 11)  # Tuesday
    # Existing 19:30–20:30
    existing_start = sched.local_dt(day, time(19, 30), tz)
    existing_end = existing_start + timedelta(hours=1)
    agenda_svc.create_appointment(
        SessionLocal(),
        organization_id=org_id,
        client_id=UUID(ids["client_id"]),
        starts_at=existing_start,
        ends_at=existing_end,
    )

    db = SessionLocal()
    try:
        # Partial overlap 20:00–21:00
        slots = [sched.ScheduleSlot(1, time(20, 0))]
        occ = sched.build_occurrences(
            starts_on=day,
            ends_on=day + timedelta(days=1),
            slots=slots,
            duration_minutes=60,
            tz=tz,
        )
        hits = sched.find_occurrence_conflicts(
            db, organization_id=org_id, occurrences=occ
        )
        assert len(hits) == 1

        # Immediately after 20:30–21:30 — no overlap
        slots2 = [sched.ScheduleSlot(1, time(20, 30))]
        occ2 = sched.build_occurrences(
            starts_on=day,
            ends_on=day + timedelta(days=1),
            slots=slots2,
            duration_minutes=60,
            tz=tz,
        )
        hits2 = sched.find_occurrence_conflicts(
            db, organization_id=org_id, occurrences=occ2
        )
        assert hits2 == []

        # Immediately before 18:30–19:30 — no overlap
        slots3 = [sched.ScheduleSlot(1, time(18, 30))]
        occ3 = sched.build_occurrences(
            starts_on=day,
            ends_on=day + timedelta(days=1),
            slots=slots3,
            duration_minutes=60,
            tz=tz,
        )
        assert (
            sched.find_occurrence_conflicts(db, organization_id=org_id, occurrences=occ3)
            == []
        )
    finally:
        db.close()


def test_cancelled_does_not_block(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id, _ = _me(client)
    tz = ZoneInfo("America/Sao_Paulo")
    day = date(2026, 8, 11)
    db = SessionLocal()
    try:
        start = sched.local_dt(day, time(19, 0), tz)
        appt = agenda_svc.create_appointment(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            starts_at=start,
            ends_at=start + timedelta(hours=1),
        )
        agenda_svc.update_appointment(
            db,
            organization_id=org_id,
            appointment_id=appt.id,
            fields={"status": "cancelled"},
        )
        slots = [sched.ScheduleSlot(1, time(19, 0))]
        occ = sched.build_occurrences(
            starts_on=day,
            ends_on=day + timedelta(days=1),
            slots=slots,
            duration_minutes=60,
            tz=tz,
        )
        assert (
            sched.find_occurrence_conflicts(db, organization_id=org_id, occurrences=occ)
            == []
        )
    finally:
        db.close()


def test_create_cycle_with_schedule_atomic_and_idempotent(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        cycle, appts = sched.create_cycle_with_schedule(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_id=UUID(ids["service_id"]),
            starts_on=date(2026, 8, 7),
            weekdays=[1, 3],
            starts_time="19:00",
            duration_type="fixed_days",
            duration_value=30,
            cycle_template_id=UUID(ids["template_id"]),
            value_cents=9000,
            final_cents=9000,
            create_receivable=True,
            idempotency_key="cycle-sched-idem-1",
            generate_appointments=True,
        )
        assert cycle.lesson_count == 8
        assert len(appts) == 8
        assert all(a.cycle_id == cycle.id for a in appts)
        assert all(a.client_id == cycle.client_id for a in appts)
        assert all(a.service_id == cycle.service_id for a in appts)

        cycle2, appts2 = sched.create_cycle_with_schedule(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_id=UUID(ids["service_id"]),
            starts_on=date(2026, 8, 7),
            weekdays=[1, 3],
            starts_time="19:00",
            duration_type="fixed_days",
            duration_value=30,
            cycle_template_id=UUID(ids["template_id"]),
            value_cents=9000,
            final_cents=9000,
            create_receivable=True,
            idempotency_key="cycle-sched-idem-1",
            generate_appointments=True,
        )
        assert cycle2.id == cycle.id
        assert len(appts2) == 8
    finally:
        db.close()


def test_create_rolls_back_on_conflict(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id, _ = _me(client)
    tz = ZoneInfo("America/Sao_Paulo")
    # Block one Thursday in the period
    conflict_day = date(2026, 8, 20)  # Thursday
    start = sched.local_dt(conflict_day, time(19, 0), tz)
    agenda_svc.create_appointment(
        SessionLocal(),
        organization_id=org_id,
        client_id=UUID(ids["client_id"]),
        starts_at=start,
        ends_at=start + timedelta(hours=1),
    )
    db = SessionLocal()
    try:
        try:
            sched.create_cycle_with_schedule(
                db,
                organization_id=org_id,
                client_id=UUID(ids["client_id"]),
                service_id=UUID(ids["service_id"]),
                starts_on=date(2026, 8, 7),
                weekdays=[1, 3],
                starts_time="19:00",
                duration_type="fixed_days",
                duration_value=30,
                cycle_template_id=UUID(ids["template_id"]),
                value_cents=9000,
                final_cents=9000,
                idempotency_key="should-fail-conflict",
                generate_appointments=True,
            )
            raise AssertionError("expected conflict")
        except AuthError as exc:
            assert exc.code == "appointment_conflict"
            assert exc.details and exc.details.get("suggestions") is not None
        # No cycle with that idempotency key
        from sqlalchemy import select
        from app.models.cycle import Cycle

        row = db.scalar(
            select(Cycle).where(
                Cycle.organization_id == org_id,
                Cycle.idempotency_key == "should-fail-conflict",
            )
        )
        assert row is None
    finally:
        db.close()


def test_suggest_recurring_requires_all_weeks_free(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id, _ = _me(client)
    tz = ZoneInfo("America/Sao_Paulo")
    # Block 20:30 only on first Tuesday — should NOT appear as recurring suggestion
    day = date(2026, 8, 11)
    start = sched.local_dt(day, time(20, 30), tz)
    agenda_svc.create_appointment(
        SessionLocal(),
        organization_id=org_id,
        client_id=UUID(ids["client_id"]),
        starts_at=start,
        ends_at=start + timedelta(hours=1),
    )
    db = SessionLocal()
    try:
        suggestions = sched.suggest_recurring_times(
            db,
            organization_id=org_id,
            starts_on=date(2026, 8, 7),
            ends_on=date(2026, 9, 6),
            weekdays=[1, 3],
            duration_minutes=60,
            tz=tz,
            preferred=time(19, 0),
            limit=8,
        )
        assert not any(s.startswith("20:30") for s in suggestions)
        assert any(s.startswith("19:00") for s in suggestions)
    finally:
        db.close()
