"""Data-repair script: cancels duplicate open routine occurrences, auditable,
never destructive. See docs/sprints/DIAGNOSIS_ROUTINES_DUPLICATION.md.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.cli.repair_routine_occurrence_duplicates import repair
from app.models.intake import OperationalOccurrence
from sqlalchemy import select
from tests.conftest import TestingSessionLocal


def _insert_legacy_duplicate(
    db,
    *,
    organization_id: uuid.UUID,
    routine_id: uuid.UUID,
    due_on: date,
    client_id: uuid.UUID | None = None,
    status: str = "open",
) -> OperationalOccurrence:
    """Simulate a pre-fix row: one per day, exactly what the old runaway loop wrote."""
    row = OperationalOccurrence(
        organization_id=organization_id,
        client_id=client_id,
        occurrence_type="custom_task",
        status=status,
        due_on=due_on,
        operational_date=due_on,
        source="routine",
        idempotency_key=f"routine:{routine_id}:{due_on.isoformat()}:legacy:{uuid.uuid4()}",
        meta={"routine_id": str(routine_id), "name": "Conferir acompanhamento"},
    )
    db.add(row)
    return row


def _make_routine(client, *, recurrence: str = "once") -> tuple[str, str, date]:
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Conferir acompanhamento",
            "task_type": "contact_client",
            "recurrence": recurrence,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    return body["id"], body["next_run_on"]


def test_repair_collapses_legacy_duplicates_to_one_canonical(client, register_payload):
    auth = client.post("/api/v1/auth/register", json=register_payload)
    org_id = uuid.UUID(auth.json()["organization"]["id"])
    routine_id, next_run_on = _make_routine(client)
    routine_uuid = uuid.UUID(routine_id)
    canonical_due = date.fromisoformat(next_run_on)

    db = TestingSessionLocal()
    try:
        # The routine's own creation already materialized one legitimate row
        # for next_run_on; simulate the pre-fix flood alongside it.
        for offset in range(1, 5):
            _insert_legacy_duplicate(
                db,
                organization_id=org_id,
                routine_id=routine_uuid,
                due_on=canonical_due - timedelta(days=offset),
            )
        db.commit()
    finally:
        db.close()

    db = TestingSessionLocal()
    try:
        before = list(
            db.scalars(
                select(OperationalOccurrence).where(
                    OperationalOccurrence.organization_id == org_id,
                    OperationalOccurrence.status == "open",
                )
            ).all()
        )
        assert len(before) == 5

        dry = repair(db, organization_id=org_id, apply=False)
        assert dry["cancelled_count"] == 4
        still_open = list(
            db.scalars(
                select(OperationalOccurrence).where(
                    OperationalOccurrence.organization_id == org_id,
                    OperationalOccurrence.status == "open",
                )
            ).all()
        )
        assert len(still_open) == 5, "dry run must not mutate anything"

        applied = repair(db, organization_id=org_id, apply=True)
        assert applied["cancelled_count"] == 4
    finally:
        db.close()

    db = TestingSessionLocal()
    try:
        open_rows = list(
            db.scalars(
                select(OperationalOccurrence).where(
                    OperationalOccurrence.organization_id == org_id,
                    OperationalOccurrence.status == "open",
                )
            ).all()
        )
        assert len(open_rows) == 1
        assert open_rows[0].due_on == canonical_due

        cancelled_rows = list(
            db.scalars(
                select(OperationalOccurrence).where(
                    OperationalOccurrence.organization_id == org_id,
                    OperationalOccurrence.status == "cancelled",
                )
            ).all()
        )
        assert len(cancelled_rows) == 4
        assert all(r.reason and r.reason.startswith("duplicate_repair:") for r in cancelled_rows)

        # Idempotent: nothing left to repair.
        again = repair(db, organization_id=org_id, apply=True)
        assert again["cancelled_count"] == 0
    finally:
        db.close()


def test_repair_never_touches_completed_history(client, register_payload):
    auth = client.post("/api/v1/auth/register", json=register_payload)
    org_id = uuid.UUID(auth.json()["organization"]["id"])
    routine_id, next_run_on = _make_routine(client)
    routine_uuid = uuid.UUID(routine_id)
    due = date.fromisoformat(next_run_on)

    db = TestingSessionLocal()
    try:
        completed = _insert_legacy_duplicate(
            db,
            organization_id=org_id,
            routine_id=routine_uuid,
            due_on=due - timedelta(days=10),
            status="completed",
        )
        db.commit()
        completed_id = completed.id
        repair(db, organization_id=org_id, apply=True)
    finally:
        db.close()

    db = TestingSessionLocal()
    try:
        row = db.get(OperationalOccurrence, completed_id)
        assert row.status == "completed"
        assert row.reason is None
    finally:
        db.close()


def test_repair_skips_group_when_routine_definition_is_gone(client, register_payload):
    auth = client.post("/api/v1/auth/register", json=register_payload)
    org_id = uuid.UUID(auth.json()["organization"]["id"])
    ghost_routine_id = uuid.uuid4()

    db = TestingSessionLocal()
    try:
        for offset in range(2):
            _insert_legacy_duplicate(
                db,
                organization_id=org_id,
                routine_id=ghost_routine_id,
                due_on=date.today() - timedelta(days=offset),
            )
        db.commit()
        result = repair(db, organization_id=org_id, apply=True)
    finally:
        db.close()

    org_stats = result["organizations"][str(org_id)]
    assert org_stats["skipped_groups"] == 1
    assert org_stats["cancelled"] == 0

    db = TestingSessionLocal()
    try:
        rows = list(
            db.scalars(
                select(OperationalOccurrence).where(OperationalOccurrence.organization_id == org_id)
            ).all()
        )
        assert all(r.status == "open" for r in rows)
    finally:
        db.close()


def test_repair_is_scoped_to_one_organization(client, register_payload):
    auth1 = client.post("/api/v1/auth/register", json=register_payload)
    org1 = uuid.UUID(auth1.json()["organization"]["id"])
    r1, next1 = _make_routine(client)
    due1 = date.fromisoformat(next1)

    payload2 = dict(register_payload)
    payload2["email"] = "other_" + register_payload["email"]
    payload2["organization_name"] = "Other org"
    auth2 = client.post("/api/v1/auth/register", json=payload2)
    org2 = uuid.UUID(auth2.json()["organization"]["id"])

    db = TestingSessionLocal()
    try:
        _insert_legacy_duplicate(
            db, organization_id=org1, routine_id=uuid.UUID(r1), due_on=due1 - timedelta(days=1)
        )
        _insert_legacy_duplicate(
            db, organization_id=org2, routine_id=uuid.uuid4(), due_on=date.today()
        )
        db.commit()
        result = repair(db, organization_id=org1, apply=True)
    finally:
        db.close()

    assert str(org2) not in result["organizations"]
    db = TestingSessionLocal()
    try:
        org2_rows = list(
            db.scalars(
                select(OperationalOccurrence).where(OperationalOccurrence.organization_id == org2)
            ).all()
        )
        assert all(r.status == "open" for r in org2_rows)
    finally:
        db.close()
