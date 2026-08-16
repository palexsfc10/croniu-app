"""Canonical routine occurrence materialization (lazy, idempotent, unique-safe).

Called when enabling/editing a routine and before Agenda/Today/IA reads.
There is no scheduler in this sprint; reads for a date window materialize that window.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.cycle import Cycle
from app.models.intake import OperationalOccurrence, RecurringClientTask
from app.services import recurrence as rec_svc
from app.services.auth import AuthError

logger = logging.getLogger("croniu.routine_occurrences")

TASK_TYPE_TO_OCCURRENCE = {
    "review_protocol": "plan_review",
    "swap_training": "plan_review",
    "request_feedback": "feedback_due",
    "send_feedback": "feedback_due",
    "prepare_renewal": "cycle_renewal",
    "review_cycle": "cycle_renewal",
    "review_evaluation": "evaluation_review",
    "contact_client": "custom_task",
    "check_payment": "custom_task",
    "free": "custom_task",
}

VALID_TRIGGERS = {"calendar", "cycle_lifecycle"}


def _spec(task: RecurringClientTask) -> dict[str, Any]:
    return dict(task.filter_json or {}) if isinstance(task.filter_json, dict) else {}


def trigger_type(spec: dict[str, Any]) -> str:
    raw = str(spec.get("trigger_type") or "calendar")
    if raw in {"client_lifecycle", "manual"}:
        return "calendar"
    return raw if raw in VALID_TRIGGERS else "calendar"


def idempotency_key(
    *,
    task_id: uuid.UUID,
    due_on: date,
    cycle_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
) -> str:
    extra = ""
    if cycle_id:
        extra += f":c:{cycle_id}"
    elif client_id:
        extra += f":p:{client_id}"
    return f"routine:{task_id}:{due_on.isoformat()}{extra}"


def _insert_open(
    db: Session,
    *,
    organization_id: uuid.UUID,
    task: RecurringClientTask,
    due: date,
    client_id: uuid.UUID | None,
    cycle_id: uuid.UUID | None,
) -> None:
    spec = _spec(task)
    key = idempotency_key(task_id=task.id, due_on=due, cycle_id=cycle_id, client_id=client_id)
    occ_type = TASK_TYPE_TO_OCCURRENCE.get(task.task_type, "custom_task")
    row = OperationalOccurrence(
        organization_id=organization_id,
        client_id=client_id,
        occurrence_type=occ_type,
        status="open",
        due_on=due,
        operational_date=due,
        source="routine",
        idempotency_key=key,
        meta={
            "routine_id": str(task.id),
            "task_type": task.task_type,
            "name": task.name,
            "trigger_type": trigger_type(spec),
            "time": spec.get("time"),
            "cycle_id": str(cycle_id) if cycle_id else None,
        },
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        logger.info("routine_occurrence_dup key=%s", key)


def _calendar_dues(task: RecurringClientTask, range_start: date, range_end: date) -> list[date]:
    spec = _spec(task)
    dues: list[date] = []
    cursor = rec_svc.next_after(
        task.recurrence, spec, weekday=task.weekday, after=range_start
    )
    guard = 0
    while cursor is not None and cursor <= range_end and guard < 400:
        dues.append(cursor)
        nxt = rec_svc.advance(task.recurrence, spec, weekday=task.weekday, from_day=cursor)
        if nxt is None or nxt <= cursor:
            break
        cursor = nxt
        guard += 1
    if task.next_run_on and range_start <= task.next_run_on <= range_end:
        if task.next_run_on not in dues:
            dues.append(task.next_run_on)
    return dues


def _cycle_due(cycle: Cycle, spec: dict[str, Any]) -> date | None:
    anchor = str(spec.get("anchor") or "ends_on")
    offset = int(spec.get("offset_days") or 0)
    if offset < 0:
        offset = abs(offset)
    if anchor == "starts_on":
        return cycle.starts_on + timedelta(days=offset)
    if offset == 0:
        return cycle.ends_on
    return cycle.ends_on - timedelta(days=offset)


def _matching_cycles(
    db: Session, *, organization_id: uuid.UUID, spec: dict[str, Any]
) -> list[Cycle]:
    rows = list(
        db.scalars(
            select(Cycle).where(
                Cycle.organization_id == organization_id,
                Cycle.status.in_(["active", "paused"]),
            )
        ).all()
    )
    service_id = spec.get("service_id")
    client_id = spec.get("client_id")
    client_ids = spec.get("client_ids") or []
    audience = spec.get("audience") or ("this_client" if client_id else "all_active")
    out: list[Cycle] = []
    for cycle in rows:
        if audience == "service" and service_id and str(cycle.service_id) != str(service_id):
            continue
        if audience == "this_client" and client_id and str(cycle.client_id) != str(client_id):
            continue
        if audience == "selected" and client_ids:
            if str(cycle.client_id) not in {str(x) for x in client_ids}:
                continue
        out.append(cycle)
    return out


def cancel_future_open(
    db: Session,
    *,
    organization_id: uuid.UUID,
    task_id: uuid.UUID,
    today: date,
) -> None:
    rows = db.scalars(
        select(OperationalOccurrence).where(
            OperationalOccurrence.organization_id == organization_id,
            OperationalOccurrence.source == "routine",
            OperationalOccurrence.status == "open",
            OperationalOccurrence.due_on > today,
        )
    ).all()
    for row in rows:
        meta = row.meta if isinstance(row.meta, dict) else {}
        if meta.get("routine_id") != str(task_id):
            continue
        row.status = "cancelled"
        db.add(row)


def ensure_routine_occurrences(
    db: Session,
    *,
    organization_id: uuid.UUID,
    range_start: date,
    range_end: date,
    commit: bool = False,
) -> None:
    if range_end < range_start:
        range_start, range_end = range_end, range_start
    tasks = list(
        db.scalars(
            select(RecurringClientTask).where(
                RecurringClientTask.organization_id == organization_id,
                RecurringClientTask.status == "active",
            )
        ).all()
    )
    for task in tasks:
        spec = _spec(task)
        kind = trigger_type(spec)
        if kind == "cycle_lifecycle":
            for cycle in _matching_cycles(db, organization_id=organization_id, spec=spec):
                due = _cycle_due(cycle, spec)
                if due is None or due < range_start or due > range_end:
                    continue
                _insert_open(
                    db,
                    organization_id=organization_id,
                    task=task,
                    due=due,
                    client_id=cycle.client_id,
                    cycle_id=cycle.id,
                )
            continue
        dues = _calendar_dues(task, range_start, range_end)
        raw_client = spec.get("client_id")
        client_id = None
        if raw_client:
            try:
                client_id = uuid.UUID(str(raw_client))
            except ValueError:
                client_id = None
        for due in dues:
            _insert_open(
                db,
                organization_id=organization_id,
                task=task,
                due=due,
                client_id=client_id,
                cycle_id=None,
            )
    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.info("routine_occurrences_commit_dup org=%s", organization_id)


def persist_for_day(db: Session, *, organization_id: uuid.UUID, day: date) -> None:
    ensure_routine_occurrences(
        db,
        organization_id=organization_id,
        range_start=day,
        range_end=day,
        commit=True,
    )


def validate_trigger(filter_json: dict[str, Any] | None) -> dict[str, Any]:
    spec = dict(filter_json or {})
    raw = str(spec.get("trigger_type") or "calendar")
    if raw in {"client_lifecycle", "manual"}:
        raise AuthError(
            "unsupported_trigger",
            "Este tipo de disparo ainda não está disponível.",
            422,
        )
    if raw not in VALID_TRIGGERS:
        raise AuthError("invalid_trigger", "Tipo de disparo inválido.", 422)
    spec["trigger_type"] = raw
    if raw == "cycle_lifecycle":
        spec["anchor"] = spec.get("anchor") or "ends_on"
        if spec["anchor"] not in {"starts_on", "ends_on"}:
            raise AuthError("invalid_anchor", "Âncora de ciclo inválida.", 422)
        spec["offset_days"] = int(spec.get("offset_days") or 0)
    return spec
