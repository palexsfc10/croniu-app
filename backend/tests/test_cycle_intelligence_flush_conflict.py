"""cycle_intelligence.create_intelligent_cycle's own db.flush() (the one
that actually inserts every planned Appointment) must go through the same
ck_appointments_no_overlap translation as commit_or_raise_conflict — never
let a database-level exclusion violation escape as a raw
IntegrityError/500. This reaches the real write path (POST
/api/v1/cycles/intelligent -> cycle_intelligence.create_intelligent_cycle),
not an isolated helper.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from uuid import UUID

from app.db import SessionLocal
from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.receivable import Receivable
from app.schemas.cycle_intelligence import IntelligentCycleCreate
from app.services import cycle_intelligence as intel_svc
from app.services.auth import AuthError
from fastapi.testclient import TestClient
from sqlalchemy import func, select


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201


def _me(client: TestClient) -> UUID:
    return UUID(client.get("/api/v1/auth/me").json()["organization"]["id"])


def _today(client: TestClient) -> date:
    local_today = client.get("/api/v1/organization/preferences").json()["local_today"]
    y, m, d = (int(part) for part in local_today.split("-"))
    return date(y, m, d)


def _next_weekday_on_or_after(start: date, weekday: int) -> date:
    from datetime import timedelta

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


def test_flush_conflict_during_intelligent_cycle_creation_returns_409_not_500(
    client, register_payload, monkeypatch
):
    """Deterministic, single-threaded reproduction of the real race: the
    pre-check (find_occurrence_conflicts) is monkeypatched to, on its first
    call inside create_intelligent_cycle, commit a conflicting Appointment
    from a *separate* session for the exact first planned slot (simulating
    another request's booking landing in that instant) and then report "no
    conflicts" (a stale view, exactly like the real pre-check would see if
    it ran a moment before the other booking committed). create_intelligent_
    cycle then proceeds — passing every one of its own initial validations —
    all the way to its own db.flush() that actually inserts the planned
    Appointment rows. That flush is where the real exclusion-constraint
    violation now happens for real, against genuinely conflicting data in
    the database, through the unmodified production code path."""
    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    monday = _next_weekday_on_or_after(_today(client), 0)

    other_client = client.post("/api/v1/clients", json={"full_name": "Outro Cliente"})
    assert other_client.status_code == 201, other_client.text
    other_client_id = UUID(other_client.json()["id"])

    real_find_occurrence_conflicts = intel_svc.schedule_svc.find_occurrence_conflicts
    calls = {"count": 0}

    def fake_find_occurrence_conflicts(db, *, organization_id, occurrences, exclude_cycle_id=None):
        calls["count"] += 1
        if calls["count"] == 1:
            occ = occurrences[0]
            other_db = SessionLocal()
            try:
                other_db.add(
                    Appointment(
                        organization_id=organization_id,
                        client_id=other_client_id,
                        starts_at=occ.starts_at,
                        ends_at=occ.ends_at,
                        status="scheduled",
                        title="Reserva concorrente",
                    )
                )
                other_db.commit()
            finally:
                other_db.close()
            return []
        return real_find_occurrence_conflicts(
            db,
            organization_id=organization_id,
            occurrences=occurrences,
            exclude_cycle_id=exclude_cycle_id,
        )

    monkeypatch.setattr(
        intel_svc.schedule_svc, "find_occurrence_conflicts", fake_find_occurrence_conflicts
    )

    res = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": monday.isoformat(),
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "create_receivable": True,
            "idempotency_key": "flush-conflict-repro",
        },
    )
    assert calls["count"] == 1, "the injected concurrent booking must land before the real flush"
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "appointment_conflict"

    db = SessionLocal()
    try:
        cycles = list(db.scalars(select(Cycle).where(Cycle.organization_id == org_id)).all())
        assert cycles == [], "no partial Cycle must survive the rejected flush"

        appts = list(
            db.scalars(select(Appointment).where(Appointment.organization_id == org_id)).all()
        )
        assert [a.client_id for a in appts] == [other_client_id], (
            "only the concurrently-committed appointment may exist — nothing from the "
            "rejected intelligent-cycle attempt"
        )

        receivables = list(
            db.scalars(select(Receivable).where(Receivable.organization_id == org_id)).all()
        )
        assert receivables == [], "no partial Receivable must survive the rejected flush"
    finally:
        db.close()

    # The session/organization must remain fully usable after the rejection —
    # a *different*, genuinely free slot succeeds normally right after.
    retry = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": monday.isoformat(),
            "weekdays": [1, 3],
            "starts_time": "14:00:00",
            "create_receivable": True,
            "idempotency_key": "flush-conflict-repro-retry",
        },
    )
    assert retry.status_code == 201, retry.text


def test_concurrent_intelligent_cycle_creation_never_double_books(client, register_payload):
    """Real concurrency, through the unmodified production path
    (POST /api/v1/cycles/intelligent -> create_intelligent_cycle), run 20
    times: two clients, identical schedule, so their generated lessons
    collide. Exactly one succeeds, the other gets a clean, known error —
    never an unhandled 500 — and the final appointment count matches only
    the winner's lessons, every time."""
    from datetime import timedelta

    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    base_monday = _next_weekday_on_or_after(_today(client), 0)

    for i in range(20):
        # Each iteration's cycle spans a full calendar month (duration_value=1);
        # 40 days between iterations' starts_on keeps them from ever overlapping
        # each other, so a rejection can only ever be the two workers of the
        # *same* iteration racing each other — never stale state left over
        # from a previous, already-decided iteration.
        monday = _next_weekday_on_or_after(base_monday + timedelta(days=40 * i), 0)

        a = client.post("/api/v1/clients", json={"full_name": f"Corrida A {i}"})
        assert a.status_code == 201, a.text
        b = client.post("/api/v1/clients", json={"full_name": f"Corrida B {i}"})
        assert b.status_code == 201, b.text
        client_a_id = UUID(a.json()["id"])
        client_b_id = UUID(b.json()["id"])

        def worker(cid: UUID, key: str, monday: date = monday, i: int = i):
            db = SessionLocal()
            try:
                return intel_svc.create_intelligent_cycle(
                    db,
                    organization_id=org_id,
                    payload=IntelligentCycleCreate(
                        client_id=cid,
                        service_id=UUID(ids["service_id"]),
                        cycle_template_id=UUID(ids["template_id"]),
                        starts_on=monday,
                        weekdays=[0, 2],
                        starts_time="09:00:00",
                        create_receivable=True,
                        idempotency_key=f"race-{i}-{key}",
                    ),
                )
            except AuthError as exc:
                return exc
            finally:
                db.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(
                pool.map(
                    lambda args: worker(*args),
                    [(client_a_id, "a"), (client_b_id, "b")],
                )
            )

        successes = [r for r in results if not isinstance(r, AuthError)]
        errors = [r for r in results if isinstance(r, AuthError)]
        assert len(successes) == 1, (i, results)
        assert len(errors) == 1, (i, results)
        assert errors[0].status_code == 409, (i, errors[0].message)
        assert errors[0].code in {"SCHEDULE_CONFLICT", "appointment_conflict"}, (i, errors[0].code)

        db = SessionLocal()
        try:
            winner_cycles = list(
                db.scalars(
                    select(Cycle).where(
                        Cycle.organization_id == org_id,
                        Cycle.client_id.in_([client_a_id, client_b_id]),
                    )
                ).all()
            )
            assert len(winner_cycles) == 1, (i, [c.id for c in winner_cycles])
            winner_cycle = winner_cycles[0]

            appt_count = db.scalar(
                select(func.count())
                .select_from(Appointment)
                .where(
                    Appointment.organization_id == org_id,
                    Appointment.client_id.in_([client_a_id, client_b_id]),
                )
            )
            assert appt_count == int(winner_cycle.lesson_count or 0), i
        finally:
            db.close()
