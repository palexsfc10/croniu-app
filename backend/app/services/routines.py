"""Recurring professional routines / client tasks."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import Session

from app.models.intake import RecurringClientTask
from app.services import recurrence as rec_svc
from app.services.auth import AuthError

VALID_TASK_TYPES = {
    "review_protocol",
    "swap_training",
    "request_feedback",
    "send_feedback",
    "review_evaluation",
    "review_cycle",
    "prepare_renewal",
    "contact_client",
    "check_payment",
    "free",
}
VALID_RECURRENCE = rec_svc.VALID_RECURRENCE


def local_today(timezone: str | None) -> date:
    return datetime.now(ZoneInfo(timezone or "America/Sao_Paulo")).date()


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
        select(RecurringClientTask)
        .where(
            RecurringClientTask.id == task_id,
            RecurringClientTask.organization_id == organization_id,
        )
        .with_for_update()
    )
    if row is None:
        raise AuthError("routine_not_found", "Rotina não encontrada.", 404)
    return row


def _validate(task_type: str, recurrence: str, weekday: int | None) -> None:
    if task_type not in VALID_TASK_TYPES:
        raise AuthError("invalid_task_type", "Tipo de rotina inválido.", 422)
    if recurrence not in VALID_RECURRENCE:
        raise AuthError("invalid_recurrence", "Recorrência inválida.", 422)
    if weekday is not None and (weekday < 0 or weekday > 6):
        raise AuthError("invalid_weekday", "Dia da semana deve ser 0–6.", 422)


def compute_next(
    *,
    recurrence: str,
    filter_json: dict[str, Any] | None,
    weekday: int | None,
    today: date,
    after: date | None = None,
) -> date | None:
    spec = filter_json or {}
    return rec_svc.next_after(recurrence, spec, weekday=weekday, after=after or today)


def preview(
    *,
    recurrence: str,
    filter_json: dict[str, Any] | None,
    weekday: int | None,
    today: date,
) -> dict[str, Any]:
    spec = filter_json or {}
    nxt = compute_next(recurrence=recurrence, filter_json=spec, weekday=weekday, today=today)
    return {
        "next_run_on": nxt.isoformat() if nxt else None,
        "preview": rec_svc.preview_text(recurrence, spec, weekday=weekday, next_on=nxt),
    }


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
    today: date | None = None,
) -> RecurringClientTask:
    name = (name or "").strip()
    if not name:
        raise AuthError("invalid_name", "Informe o nome da rotina.", 422)
    _validate(task_type, recurrence, weekday)
    day = today or date.today()
    nxt = next_run_on or compute_next(
        recurrence=recurrence, filter_json=filter_json, weekday=weekday, today=day
    )
    row = RecurringClientTask(
        id=uuid.uuid4(),
        organization_id=organization_id,
        name=name[:200],
        task_type=task_type,
        weekday=weekday,
        recurrence=recurrence,
        lead_days=lead_days or 0,
        filter_json=filter_json,
        next_run_on=nxt,
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
    today: date | None = None,
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
    if fields.get("recompute"):
        day = today or date.today()
        row.next_run_on = compute_next(
            recurrence=row.recurrence,
            filter_json=row.filter_json,
            weekday=row.weekday,
            today=day,
        )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def skip_occurrence(
    db: Session, *, organization_id: uuid.UUID, task_id: uuid.UUID, today: date | None = None
) -> RecurringClientTask:
    row = get_routine(db, organization_id=organization_id, task_id=task_id)
    base = row.next_run_on or today or date.today()
    row.next_run_on = rec_svc.advance(
        row.recurrence, row.filter_json or {}, weekday=row.weekday, from_day=base
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def complete_routine(
    db: Session,
    *,
    organization_id: uuid.UUID,
    task_id: uuid.UUID,
    today: date | None = None,
    occurrence_on: date | None = None,
) -> RecurringClientTask:
    row = get_routine(db, organization_id=organization_id, task_id=task_id)
    now = datetime.now(UTC)
    spec = dict(row.filter_json or {})
    target = occurrence_on or row.next_run_on or today or date.today()
    if spec.get("last_occurrence_completed") == target.isoformat():
        return row
    spec["last_occurrence_completed"] = target.isoformat()
    row.filter_json = spec
    flag_modified(row, "filter_json")
    row.last_completed_at = now
    row.next_run_on = rec_svc.advance(
        row.recurrence, spec, weekday=row.weekday, from_day=target
    )
    if row.recurrence == "once":
        row.status = "archived"
        row.next_run_on = None
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
