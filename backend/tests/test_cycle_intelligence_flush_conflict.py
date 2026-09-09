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
from app.models.renewal_case import RenewalCase
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


def test_renewal_flush_conflict_returns_409_not_500_and_fully_atomic(
    client, register_payload, monkeypatch
):
    """Same class of bug as the test above, but through the renewal path
    specifically: create_intelligent_cycle's own db.flush()/db.commit() were
    already protected (see the previous test), but when renewed_from_cycle_id
    is set, this function also calls renewal_case_svc.mark_renewed — which
    runs its own query (_get_cycle; this session factory sets autoflush=False,
    see app/db.py, so that query alone does not flush the pending Appointments
    added above) and then its own explicit db.flush() (renewal_case.py:335) —
    which does. That flush call site is inside renewal_case.py, not
    cycle_intelligence.py, so the earlier point-fix (protecting only
    cycle_intelligence's own flush) never covered this. Reproduced the same
    way: the pre-check is monkeypatched to commit a
    conflicting Appointment from a separate session for the renewal cycle's
    first planned slot, then report "no conflicts" — a stale view — letting
    create_intelligent_cycle proceed through building the cycle, the
    receivable, every planned Appointment, ending the source cycle, and into
    renewal_case_svc.mark_renewed, where the real exclusion-constraint
    violation now surfaces, deep inside an auxiliary service, nowhere near
    any flush call site written in cycle_intelligence.py."""
    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    monday = _next_weekday_on_or_after(_today(client), 0)

    source = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": monday.isoformat(),
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "create_receivable": True,
            "idempotency_key": "renewal-repro-source",
        },
    )
    assert source.status_code == 201, source.text
    source_cycle_id = source.json()["id"]
    source_lesson_count = source.json()["lesson_count"]

    other_client = client.post("/api/v1/clients", json={"full_name": "Outro Cliente Renovação"})
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
                        title="Reserva concorrente (renovação)",
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
            "weekdays": [1, 3],
            "starts_time": "15:00:00",
            "create_receivable": True,
            "renewed_from_cycle_id": source_cycle_id,
            "idempotency_key": "renewal-repro-renewal",
        },
    )
    assert (
        calls["count"] == 1
    ), "the injected concurrent booking must land before mark_renewed's flush"
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "appointment_conflict"

    db = SessionLocal()
    try:
        cycles = list(db.scalars(select(Cycle).where(Cycle.organization_id == org_id)).all())
        assert [str(c.id) for c in cycles] == [
            source_cycle_id
        ], "no partial renewal Cycle must survive — only the source cycle remains"

        appts = list(
            db.scalars(select(Appointment).where(Appointment.organization_id == org_id)).all()
        )
        source_appt_count = sum(1 for a in appts if str(a.cycle_id) == source_cycle_id)
        injected_appt_count = sum(1 for a in appts if a.client_id == other_client_id)
        assert source_appt_count == source_lesson_count, (source_appt_count, source_lesson_count)
        assert injected_appt_count == 1
        assert (
            len(appts) == source_appt_count + injected_appt_count
        ), "nothing from the rejected renewal cycle may exist"

        receivables = list(
            db.scalars(select(Receivable).where(Receivable.organization_id == org_id)).all()
        )
        assert len(receivables) == 1, "only the source cycle's own receivable may exist"

        renewal_cases = list(
            db.scalars(select(RenewalCase).where(RenewalCase.organization_id == org_id)).all()
        )
        assert (
            renewal_cases == []
        ), "no RenewalCase may survive — mark_renewed's own db.add(case) was rolled back too"

        fresh_source = db.get(Cycle, UUID(source_cycle_id))
        assert (
            fresh_source.status == "active"
        ), "the source cycle must remain untouched, never ended"
    finally:
        db.close()

    # Session/organization must remain fully usable — a different, genuinely
    # free slot succeeds normally right after. A different starts_on (not
    # just a different weekday/time) is required: assert_no_duplicate_or_
    # overlap's "identical cycle" check compares starts_on/ends_on/
    # lesson_count for this same client+service, which the source cycle
    # above would otherwise still match (same starts_on, same 1-month
    # duration) regardless of which weekdays/time are picked.
    from datetime import timedelta

    later_monday = _next_weekday_on_or_after(monday + timedelta(days=40), 0)
    retry = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": later_monday.isoformat(),
            "weekdays": [1, 3],
            "starts_time": "18:00:00",
            "create_receivable": True,
            "idempotency_key": "renewal-repro-retry",
        },
    )
    assert retry.status_code == 201, retry.text


def test_concurrent_intelligent_renewal_never_double_books(client, register_payload):
    """Real concurrency through the renewal path specifically (renewed_from_
    cycle_id set, so renewal_case_svc.mark_renewed runs), run 20 times: two
    different clients, each with their own source cycle, both renewing into
    the identical colliding schedule at once. Exactly one succeeds, the
    other gets a clean 409 — never an unhandled 500 — with the final
    appointment count matching only the winner's lessons and no orphaned
    RenewalCase left behind for the loser."""
    from datetime import timedelta

    _auth(client, register_payload)
    ids = _seed(client)
    org_id = _me(client)
    base_monday = _next_weekday_on_or_after(_today(client), 0)

    for i in range(20):
        # Same spacing rationale as test_concurrent_intelligent_cycle_creation_
        # never_double_books above: each iteration's source + renewal cycles
        # together span a bit over a month, so 80 days keeps iterations from
        # ever overlapping each other.
        monday = _next_weekday_on_or_after(base_monday + timedelta(days=80 * i), 0)

        a = client.post("/api/v1/clients", json={"full_name": f"Renov A {i}"})
        assert a.status_code == 201, a.text
        b = client.post("/api/v1/clients", json={"full_name": f"Renov B {i}"})
        assert b.status_code == 201, b.text
        client_a_id = a.json()["id"]
        client_b_id = b.json()["id"]

        source_a = client.post(
            "/api/v1/cycles/intelligent",
            json={
                "client_id": client_a_id,
                "service_id": ids["service_id"],
                "cycle_template_id": ids["template_id"],
                "starts_on": monday.isoformat(),
                "weekdays": [0, 2],
                "starts_time": "09:00:00",
                "create_receivable": True,
                "idempotency_key": f"renewal-race-{i}-source-a",
            },
        )
        assert source_a.status_code == 201, source_a.text
        source_b = client.post(
            "/api/v1/cycles/intelligent",
            json={
                "client_id": client_b_id,
                "service_id": ids["service_id"],
                "cycle_template_id": ids["template_id"],
                "starts_on": monday.isoformat(),
                # Distinct weekdays from source_a's [0, 2] (Mon/Wed) — both
                # cycles share the same organization, and
                # ck_appointments_no_overlap is org-wide, not per-client, so
                # any shared weekday+time between the two source cycles
                # would collide with each other at creation time.
                "weekdays": [1, 3],
                "starts_time": "09:00:00",
                "create_receivable": True,
                "idempotency_key": f"renewal-race-{i}-source-b",
            },
        )
        assert source_b.status_code == 201, source_b.text
        source_a_id = UUID(source_a.json()["id"])
        source_b_id = UUID(source_b.json()["id"])

        renewal_monday = _next_weekday_on_or_after(monday + timedelta(days=35), 0)

        def worker(
            client_id: UUID,
            source_cycle_id: UUID,
            key: str,
            renewal_monday: date = renewal_monday,
            i: int = i,
        ):
            db = SessionLocal()
            try:
                return intel_svc.create_intelligent_cycle(
                    db,
                    organization_id=org_id,
                    payload=IntelligentCycleCreate(
                        client_id=client_id,
                        service_id=UUID(ids["service_id"]),
                        cycle_template_id=UUID(ids["template_id"]),
                        starts_on=renewal_monday,
                        weekdays=[1, 3],
                        starts_time="15:00:00",
                        create_receivable=True,
                        renewed_from_cycle_id=source_cycle_id,
                        idempotency_key=f"renewal-race-{i}-renewal-{key}",
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
                    [
                        (client_a_id, source_a_id, "a"),
                        (client_b_id, source_b_id, "b"),
                    ],
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
            renewal_cycles = list(
                db.scalars(
                    select(Cycle).where(
                        Cycle.organization_id == org_id,
                        Cycle.client_id.in_([client_a_id, client_b_id]),
                        Cycle.starts_on == renewal_monday,
                    )
                ).all()
            )
            assert len(renewal_cycles) == 1, (i, [c.id for c in renewal_cycles])
            winner_cycle = renewal_cycles[0]

            appt_count = db.scalar(
                select(func.count())
                .select_from(Appointment)
                .where(Appointment.cycle_id == winner_cycle.id)
            )
            assert appt_count == int(winner_cycle.lesson_count or 0), i

            renewal_case_count = db.scalar(
                select(func.count())
                .select_from(RenewalCase)
                .where(
                    RenewalCase.organization_id == org_id,
                    RenewalCase.source_cycle_id.in_([source_a_id, source_b_id]),
                )
            )
            # Exactly one RenewalCase — the winner's. The loser's mark_renewed
            # never committed (rolled back with everything else).
            assert renewal_case_count == 1, i
        finally:
            db.close()


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
