"""Gate: cancelling a routine must cancel today's open occurrence, not just future
ones — cancel_future_open previously used due_on > today (exclusive), leaving an
open pendency for today that contradicted the routine's own cancelled status.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from app.agent.tools import WRITE_EXECUTORS, ToolContext
from app.db import SessionLocal
from app.models.intake import OperationalOccurrence, RecurringClientTask
from app.services import routine_occurrences as occ_svc
from app.services import routines as routine_svc
from sqlalchemy import select


def _auth(client, payload: dict) -> tuple[uuid.UUID, uuid.UUID]:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _routine(db, org_id: uuid.UUID, name: str) -> RecurringClientTask:
    row = RecurringClientTask(
        organization_id=org_id,
        name=name,
        task_type="free",
        recurrence="weekly",
        weekday=0,
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _occurrence(
    db,
    org_id: uuid.UUID,
    routine_id: uuid.UUID,
    *,
    due_on: date,
    status: str,
    key: str,
    completed_at: datetime | None = None,
) -> OperationalOccurrence:
    row = OperationalOccurrence(
        organization_id=org_id,
        occurrence_type="custom_task",
        status=status,
        due_on=due_on,
        operational_date=due_on,
        source="routine",
        idempotency_key=key,
        meta={"routine_id": str(routine_id)},
        completed_at=completed_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_cancel_future_open_cancels_today_and_future_preserves_past_and_completed(
    client, register_payload
):
    org_id, _user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        routine = _routine(db, org_id, "Rotina Gate")
        today = date(2026, 9, 3)
        past = _occurrence(
            db, org_id, routine.id, due_on=today - timedelta(days=1), status="open", key="gate-past"
        )
        today_open = _occurrence(
            db, org_id, routine.id, due_on=today, status="open", key="gate-today"
        )
        future = _occurrence(
            db, org_id, routine.id, due_on=today + timedelta(days=7), status="open", key="gate-future"
        )
        completed_today = _occurrence(
            db,
            org_id,
            routine.id,
            due_on=today,
            status="completed",
            key="gate-completed-today",
            completed_at=datetime.now(UTC),
        )

        occ_svc.cancel_future_open(db, organization_id=org_id, task_id=routine.id, today=today)
        db.commit()

        db.refresh(past)
        db.refresh(today_open)
        db.refresh(future)
        db.refresh(completed_today)

        assert past.status == "open", "past pendencies are history — never touched"
        assert today_open.status == "cancelled", "today's open occurrence follows the future rule"
        assert future.status == "cancelled"
        assert completed_today.status == "completed", "already-completed work is preserved"
    finally:
        db.close()


def test_cancel_future_open_never_touches_another_organization(client, register_payload):
    org_id, _user_id = _auth(client, register_payload)
    today = date(2026, 9, 3)
    db = SessionLocal()
    try:
        routine_a = _routine(db, org_id, "Rotina Org A")
        occ_a = _occurrence(
            db, org_id, routine_a.id, due_on=today, status="open", key="gate-tenant-a"
        )
        routine_a_id = routine_a.id
        occ_a_id = occ_a.id
    finally:
        db.close()

    client.post("/api/v1/auth/logout")
    other = {
        "email": "gate_routine_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio Gate",
    }
    other_org, _other_user = _auth(client, other)
    db = SessionLocal()
    try:
        routine_b = _routine(db, other_org, "Rotina Org B")
        occ_b = _occurrence(
            db, other_org, routine_b.id, due_on=today, status="open", key="gate-tenant-b"
        )
        occ_b_id = occ_b.id

        # Cancel only org A's routine — org B's same-day occurrence must survive.
        occ_svc.cancel_future_open(db, organization_id=org_id, task_id=routine_a_id, today=today)
        db.commit()

        refreshed_a = db.get(OperationalOccurrence, occ_a_id)
        refreshed_b = db.get(OperationalOccurrence, occ_b_id)
        assert refreshed_a.status == "cancelled"
        assert refreshed_b.status == "open", "another organization's occurrence must never change"
    finally:
        db.close()


def test_manual_and_ai_cancel_paths_use_the_same_service_and_cancel_todays_occurrence(
    client, register_payload
):
    """Manual PATCH /routines/{id} and the AI's execute_cancel_routine both call
    routines_svc.update_routine — this proves they produce identical results."""
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        today = routine_svc.local_today(None)
        manual_routine = _routine(db, org_id, "Cancelada manualmente")
        manual_occ = _occurrence(
            db, org_id, manual_routine.id, due_on=today, status="open", key="gate-manual"
        )
        ai_routine = _routine(db, org_id, "Cancelada pela IA")
        ai_occ = _occurrence(
            db, org_id, ai_routine.id, due_on=today, status="open", key="gate-ai"
        )
        manual_routine_id = manual_routine.id
        ai_routine_id = ai_routine.id
        manual_occ_id = manual_occ.id
        ai_occ_id = ai_occ.id
    finally:
        db.close()

    # Manual path: same endpoint the frontend uses.
    manual_resp = client.patch(
        f"/api/v1/routines/{manual_routine_id}", json={"status": "archived"}
    )
    assert manual_resp.status_code == 200, manual_resp.text

    # AI path: the tool executor, org-local "today" resolved the same way.
    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = WRITE_EXECUTORS["cancel_routine"](ctx, {"routine_id": str(ai_routine_id)})
        assert result["status"] == "archived"
    finally:
        db.close()

    db = SessionLocal()
    try:
        assert db.get(RecurringClientTask, manual_routine_id).status == "archived"
        assert db.get(RecurringClientTask, ai_routine_id).status == "archived"
        assert db.get(OperationalOccurrence, manual_occ_id).status == "cancelled"
        assert db.get(OperationalOccurrence, ai_occ_id).status == "cancelled"
    finally:
        db.close()
