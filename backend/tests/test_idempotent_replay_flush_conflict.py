"""replay_or_release_idempotent_cycle (cycle_schedule.py) is the very first
mutating step of create_intelligent_cycle/create_cycle_with_schedule: when
it finds an "incomplete" cycle for the same idempotency_key (a prior attempt
that committed the Cycle but not every planned Appointment), it marks that
cycle cancelled, clears its idempotency_key, and flushes — before either
public function's own guard used to start. appointment_overlap_guard now
opens before this call (not just around the later db.add(cycle)/commit), so
a concurrent-booking violation surfacing at *this* flush is translated into
409 the same as any other, and the flush's own mutation (existing.status,
existing.idempotency_key) is rolled back along with everything else.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest
from app.db import SessionLocal
from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.receivable import Receivable
from app.schemas.cycle_intelligence import IntelligentCycleCreate
from app.services import cycle_intelligence as intel_svc
from app.services import cycle_schedule as sched
from app.services.auth import AuthError
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201


def _me(client: TestClient) -> UUID:
    return UUID(client.get("/api/v1/auth/me").json()["organization"]["id"])


def _today(client: TestClient) -> date:
    local_today = client.get("/api/v1/organization/preferences").json()["local_today"]
    y, m, d = (int(part) for part in local_today.split("-"))
    return date(y, m, d)


def _next_weekday_on_or_after(start: date, weekday: int) -> date:
    return start + timedelta(days=(weekday - start.weekday()) % 7)


def _seed(client: TestClient) -> dict:
    c = client.post("/api/v1/clients", json={"full_name": "Cliente Principal"})
    assert c.status_code == 201, c.text
    s = client.post(
        "/api/v1/services",
        json={"name": "Aula padrão", "default_price_cents": 9000, "default_duration_minutes": 60},
    )
    assert s.status_code == 201, s.text
    t = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x — mensal",
            "weekly_frequency": 2,
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


def _make_incomplete_cycle(client: TestClient, ids: dict, monday: date, key: str) -> dict:
    """A cycle that looks like a prior attempt committed the Cycle row but was
    interrupted before every planned Appointment landed — exactly the state
    replay_or_release_idempotent_cycle's `incomplete` branch detects. Created
    for real through the API, then one Appointment is deleted directly to
    simulate the interruption (no production code path does this on purpose;
    it's the *symptom* the helper exists to clean up)."""
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": monday.isoformat(),
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "create_receivable": True,
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    cycle_id = created.json()["id"]
    lesson_count = created.json()["lesson_count"]
    assert lesson_count >= 2

    db = SessionLocal()
    try:
        appts = list(
            db.scalars(select(Appointment).where(Appointment.cycle_id == UUID(cycle_id))).all()
        )
        assert len(appts) == lesson_count
        db.delete(appts[0])
        db.commit()
    finally:
        db.close()
    return {"cycle_id": cycle_id, "lesson_count": lesson_count}


def test_incomplete_idempotent_cycle_is_detected_by_replay_helper(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    monday = _next_weekday_on_or_after(_today(client), 0)
    key = "incomplete-detect"
    old = _make_incomplete_cycle(client, ids, monday, key)

    db = SessionLocal()
    try:
        result = sched.replay_or_release_idempotent_cycle(
            db, organization_id=org_id, idempotency_key=key
        )
        assert result is None, "an incomplete cycle must release the key, not replay it"
        existing = db.get(Cycle, UUID(old["cycle_id"]))
        assert existing.status == "cancelled"
        assert existing.idempotency_key is None
        db.commit()
    finally:
        db.close()


def test_replay_helpers_own_flush_hits_a_real_overlap_violation(client, register_payload):
    """Direct, unit-level proof that replay_or_release_idempotent_cycle's own
    db.flush() (line ~254 of cycle_schedule.py) is where a real
    ck_appointments_no_overlap violation can surface: a second, conflicting
    Appointment already pending in the same session (added but not yet
    flushed — standing in for whatever else the calling operation had
    already added to this same unit of work before reaching the replay
    check) gets flushed alongside existing.status="cancelled" the moment
    this helper calls db.flush(), and Postgres validates the exclusion
    constraint immediately on that INSERT."""
    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    monday = _next_weekday_on_or_after(_today(client), 0)
    key = "incomplete-flush-hits-violation"
    _make_incomplete_cycle(client, ids, monday, key)

    other = client.post("/api/v1/clients", json={"full_name": "Outro Cliente"})
    assert other.status_code == 201, other.text
    other_client_id = UUID(other.json()["id"])

    conflict_starts = datetime(2028, 1, 3, 9, 0, tzinfo=UTC)
    conflict_ends = conflict_starts + timedelta(hours=1)
    seed_db = SessionLocal()
    try:
        seed_db.add(
            Appointment(
                organization_id=org_id,
                client_id=other_client_id,
                starts_at=conflict_starts,
                ends_at=conflict_ends,
                status="scheduled",
                title="Reserva já existente",
            )
        )
        seed_db.commit()
    finally:
        seed_db.close()

    db = SessionLocal()
    try:
        db.add(
            Appointment(
                organization_id=org_id,
                client_id=UUID(ids["client_id"]),
                starts_at=conflict_starts,
                ends_at=conflict_ends,
                status="scheduled",
                title="Pendente na mesma unidade de trabalho",
            )
        )
        with pytest.raises(IntegrityError) as excinfo:
            sched.replay_or_release_idempotent_cycle(
                db, organization_id=org_id, idempotency_key=key
            )
        assert excinfo.value.orig.sqlstate == "23P01"
        db.rollback()
    finally:
        db.close()


def test_incomplete_replay_flush_conflict_returns_409_not_500_and_atomic(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    monday = _next_weekday_on_or_after(_today(client), 0)
    key = "incomplete-replay-409"
    old = _make_incomplete_cycle(client, ids, monday, key)

    other = client.post("/api/v1/clients", json={"full_name": "Outro Cliente 409"})
    assert other.status_code == 201, other.text
    other_client_id = UUID(other.json()["id"])

    conflict_starts = datetime(2028, 2, 7, 9, 0, tzinfo=UTC)
    conflict_ends = conflict_starts + timedelta(hours=1)
    seed_db = SessionLocal()
    try:
        seed_db.add(
            Appointment(
                organization_id=org_id,
                client_id=other_client_id,
                starts_at=conflict_starts,
                ends_at=conflict_ends,
                status="scheduled",
                title="Reserva já existente",
            )
        )
        seed_db.commit()
    finally:
        seed_db.close()

    db = SessionLocal()
    try:
        db.add(
            Appointment(
                organization_id=org_id,
                client_id=UUID(ids["client_id"]),
                starts_at=conflict_starts,
                ends_at=conflict_ends,
                status="scheduled",
                title="Pendente na mesma unidade de trabalho",
            )
        )
        with pytest.raises(AuthError) as excinfo:
            intel_svc.create_intelligent_cycle(
                db,
                organization_id=org_id,
                payload=IntelligentCycleCreate(
                    client_id=UUID(ids["client_id"]),
                    service_id=UUID(ids["service_id"]),
                    cycle_template_id=UUID(ids["template_id"]),
                    starts_on=monday,
                    weekdays=[0, 2],
                    starts_time="09:00:00",
                    create_receivable=True,
                    idempotency_key=key,
                ),
            )
        assert excinfo.value.code == "appointment_conflict"
        assert excinfo.value.status_code == 409
    finally:
        db.close()

    db = SessionLocal()
    try:
        existing = db.get(Cycle, UUID(old["cycle_id"]))
        assert existing.status == "active", "rollback must restore existing.status"
        assert existing.idempotency_key == key, "rollback must restore existing.idempotency_key"

        cycles = list(db.scalars(select(Cycle).where(Cycle.organization_id == org_id)).all())
        assert [str(c.id) for c in cycles] == [
            old["cycle_id"]
        ], "no partial new Cycle may survive the rejected replay-path flush"

        appts = list(
            db.scalars(select(Appointment).where(Appointment.organization_id == org_id)).all()
        )
        old_appt_count = sum(1 for a in appts if str(a.cycle_id) == old["cycle_id"])
        assert old_appt_count == old["lesson_count"] - 1, (
            "the old cycle's own appointments (minus the one deleted to make it "
            "incomplete) must be exactly as they were before this attempt"
        )
        other_appt_count = sum(1 for a in appts if a.client_id == other_client_id)
        assert other_appt_count == 1
        assert len(appts) == old_appt_count + other_appt_count, (
            "nothing from the rejected attempt — including the pending duplicate "
            "this test added — may persist"
        )

        receivables = list(
            db.scalars(select(Receivable).where(Receivable.organization_id == org_id)).all()
        )
        assert len(receivables) == 1, "only the old cycle's own receivable may exist"
    finally:
        db.close()


# "Outra IntegrityError continua sendo relançada" is already covered
# generically, at the guard level, by test_agenda_conflict_classification.py
# (test_guard_other_constraint_23p01_is_reraised_untouched,
# test_guard_23p01_without_readable_constraint_name_is_reraised,
# test_guard_other_sqlstate_is_reraised_even_with_matching_constraint_name).
# Moving the guard's entry point earlier in create_intelligent_cycle/
# create_cycle_with_schedule did not touch _handle_overlap_integrity_error —
# those tests remain fully valid for this position too, so this file does not
# duplicate them.


def test_valid_idempotent_replay_still_returns_normally(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    monday = _next_weekday_on_or_after(_today(client), 0)
    key = "valid-replay"
    payload = {
        "client_id": ids["client_id"],
        "service_id": ids["service_id"],
        "cycle_template_id": ids["template_id"],
        "starts_on": monday.isoformat(),
        "weekdays": [0, 2],
        "starts_time": "09:00:00",
        "create_receivable": True,
        "idempotency_key": key,
    }
    first = client.post("/api/v1/cycles/intelligent", json=payload)
    assert first.status_code == 201, first.text

    replay = client.post("/api/v1/cycles/intelligent", json=payload)
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == first.json()["id"], "a complete cycle must simply replay"
