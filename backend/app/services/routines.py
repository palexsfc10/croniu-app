"""Recurring professional routines / client tasks."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.intake import RecurringClientTask
from app.services.auth import AuthError

VALID_TASK_TYPES = {
    "review_protocol",
    "swap_training",
    "request_feedback",
    "send_feedback",
    "review_evaluation",
    "review_cycle",
    "free",
}
VALID_RECURRENCE = {"weekly", "monthly", "once"}


def list_routines(
    db: Session, *, organization_id: uuid.UUID, status: str | None = "active"
) -> list[RecurringClientTask]:
    q = select(RecurringClientTask).where(
        RecurringClientTask.organization_id == organization_id
    )
    if status:
        q = q.where(RecurringClientTask.status == status)
    return list(db.scalars(q.order_by(RecurringClientTask.next_run_on.asc().nullslast())).all())


def get_routine(
    db: Session, *, organization_id: uuid.UUID, task_id: uuid.UUID
) -> RecurringClientTask:
    row = db.scalar(
        select(RecurringClientTask).where(
            RecurringClientTask.id == task_id,
            RecurringClientTask.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("routine_not_found", "Rotina não encontrada.", 404)
    return row


def create_routine(
    db: Session,
    *,
    organization_id: uuid.UUID,
    name: str,
    task_type: str,
    recurrence: str = "weekly",
    weekday: int | None = None,
    lead_days: int = 0,
    filter_json: dict[str, Any] | None = None,
    next_run_on: date | None = None,
) -> RecurringClientTask:
    name = (name or "").strip()
    if not name:
        raise AuthError("invalid_name", "Informe o nome da rotina.", 422)
    if task_type not in VALID_TASK_TYPES:
        raise AuthError("invalid_task_type", "Tipo de rotina inválido.", 422)
    if recurrence not in VALID_RECURRENCE:
        raise AuthError("invalid_recurrence", "Recorrência inválida.", 422)
    if weekday is not None and (weekday < 0 or weekday > 6):
        raise AuthError("invalid_weekday", "Dia da semana deve ser 0–6.", 422)

    row = RecurringClientTask(
        id=uuid.uuid4(),
        organization_id=organization_id,
        name=name[:200],
        task_type=task_type,
        weekday=weekday,
        recurrence=recurrence,
        lead_days=lead_days or 0,
        filter_json=filter_json,
        next_run_on=next_run_on or date.today(),
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_routine(
    db: Session,
    *,
    organization_id: uuid.UUID,
    task_id: uuid.UUID,
    **fields: Any,
) -> RecurringClientTask:
    row = get_routine(db, organization_id=organization_id, task_id=task_id)
    if "name" in fields and fields["name"] is not None:
        row.name = str(fields["name"]).strip()[:200]
    if "task_type" in fields and fields["task_type"] is not None:
        if fields["task_type"] not in VALID_TASK_TYPES:
            raise AuthError("invalid_task_type", "Tipo de rotina inválido.", 422)
        row.task_type = fields["task_type"]
    if "recurrence" in fields and fields["recurrence"] is not None:
        if fields["recurrence"] not in VALID_RECURRENCE:
            raise AuthError("invalid_recurrence", "Recorrência inválida.", 422)
        row.recurrence = fields["recurrence"]
    if "weekday" in fields:
        weekday = fields["weekday"]
        if weekday is not None and (weekday < 0 or weekday > 6):
            raise AuthError("invalid_weekday", "Dia da semana deve ser 0–6.", 422)
        row.weekday = weekday
    if "lead_days" in fields and fields["lead_days"] is not None:
        row.lead_days = int(fields["lead_days"])
    if "filter_json" in fields:
        row.filter_json = fields["filter_json"]
    if "next_run_on" in fields:
        row.next_run_on = fields["next_run_on"]
    if "status" in fields and fields["status"] is not None:
        if fields["status"] not in {"active", "paused", "archived"}:
            raise AuthError("invalid_status", "Status de rotina inválido.", 422)
        row.status = fields["status"]
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _advance_next_run(row: RecurringClientTask, *, from_day: date) -> date | None:
    if row.recurrence == "once":
        return None
    if row.recurrence == "weekly":
        return from_day + timedelta(days=7)
    if row.recurrence == "monthly":
        month = from_day.month + 1
        year = from_day.year
        if month > 12:
            month = 1
            year += 1
        day = min(from_day.day, 28)
        return date(year, month, day)
    return from_day + timedelta(days=7)


def complete_routine(
    db: Session, *, organization_id: uuid.UUID, task_id: uuid.UUID
) -> RecurringClientTask:
    row = get_routine(db, organization_id=organization_id, task_id=task_id)
    now = datetime.now(UTC)
    row.last_completed_at = now
    base = row.next_run_on or date.today()
    row.next_run_on = _advance_next_run(row, from_day=base)
    if row.recurrence == "once":
        row.status = "archived"
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
