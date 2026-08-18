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

from app.models.client import Client
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
VALID_AUDIENCE = {"all_active", "selected", "this_client", "general"}


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
    """The single next due date for this routine, if it falls inside the window.

    `task.next_run_on` is the authoritative "next due" pointer, explicitly
    maintained by create/update/complete/skip — it must be preferred over any
    date a generic recurrence scan could surface by starting from
    `range_start` instead of from the routine's own cursor. Two reasons:

    - For `once`, `recurrence.next_after` has no persisted `starts_on` anchor
      and degenerates to "due on whatever day you ask", so a scan from
      `range_start` across a multi-day window would treat the task as due
      every single day of that window instead of exactly once.
    - For recurring kinds, a scan from `range_start` can surface an earlier
      recurrence instance than `next_run_on` (e.g. one period before it),
      which would materialize the "wrong" occurrence relative to the state
      the rest of the lifecycle (complete/skip) tracks.

    Only one due date is ever returned: at most one open occurrence per
    routine+target is the invariant `ensure_routine_occurrences` enforces.
    """
    if task.next_run_on is not None:
        # No lower bound: an occurrence overdue by more than the lookback
        # window is still due — it must keep surfacing as overdue, not
        # silently drop out of materialization once it ages past range_start.
        if task.next_run_on <= range_end:
            return [task.next_run_on]
        return []
    if task.recurrence == "once":
        return []
    spec = _spec(task)
    cursor = rec_svc.next_after(task.recurrence, spec, weekday=task.weekday, after=range_start)
    if cursor is not None and cursor <= range_end:
        return [cursor]
    return []


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


def _has_open_occurrence(
    db: Session,
    *,
    organization_id: uuid.UUID,
    task_id: uuid.UUID,
    client_id: uuid.UUID | None,
    cycle_id: uuid.UUID | None,
) -> bool:
    """At most one open occurrence per (routine, target). While one is open —
    pending or overdue — materialization must not create a second one for the
    same target, even if several recurrence periods have elapsed unresolved.
    """
    q = select(OperationalOccurrence.id).where(
        OperationalOccurrence.organization_id == organization_id,
        OperationalOccurrence.source == "routine",
        OperationalOccurrence.status == "open",
        OperationalOccurrence.meta["routine_id"].astext == str(task_id),
    )
    if cycle_id is not None:
        q = q.where(OperationalOccurrence.cycle_id == cycle_id)
    elif client_id is not None:
        q = q.where(OperationalOccurrence.client_id == client_id)
    else:
        q = q.where(
            OperationalOccurrence.client_id.is_(None),
            OperationalOccurrence.cycle_id.is_(None),
        )
    return db.scalar(q.limit(1)) is not None


def _matching_clients(
    db: Session, *, organization_id: uuid.UUID, spec: dict[str, Any]
) -> list[uuid.UUID | None]:
    """Resolve the fan-out target(s) for a calendar-trigger routine.

    - audience "all_active": one occurrence per active client (elegível).
    - audience "selected": one occurrence per client in client_ids.
    - audience "this_client" (or a bare client_id, back-compat): one client.
    - anything else ("general" / unset): a single org-wide occurrence
      (client_id=None) — for routines that are not per-student by design.
    """
    audience = spec.get("audience")
    client_ids = spec.get("client_ids") or []
    raw_client = spec.get("client_id")
    if audience in {"all_active", "selected"}:
        rows = list(
            db.scalars(
                select(Client.id).where(
                    Client.organization_id == organization_id,
                    Client.status == "active",
                )
            ).all()
        )
        if audience == "selected" and client_ids:
            wanted = {str(x) for x in client_ids}
            rows = [cid for cid in rows if str(cid) in wanted]
        return list(rows)
    if audience == "this_client" or raw_client:
        try:
            return [uuid.UUID(str(raw_client))] if raw_client else []
        except ValueError:
            return []
    return [None]


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
                if _has_open_occurrence(
                    db,
                    organization_id=organization_id,
                    task_id=task.id,
                    client_id=cycle.client_id,
                    cycle_id=cycle.id,
                ):
                    continue
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
        if not dues:
            continue
        earliest = min(dues)
        for target_client in _matching_clients(db, organization_id=organization_id, spec=spec):
            if _has_open_occurrence(
                db,
                organization_id=organization_id,
                task_id=task.id,
                client_id=target_client,
                cycle_id=None,
            ):
                continue
            _insert_open(
                db,
                organization_id=organization_id,
                task=task,
                due=earliest,
                client_id=target_client,
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
    audience = spec.get("audience")
    if audience is None:
        audience = "this_client" if spec.get("client_id") else "general"
    if audience not in VALID_AUDIENCE:
        raise AuthError("invalid_audience", "Escopo de rotina inválido.", 422)
    if audience == "selected" and not (spec.get("client_ids") or []):
        raise AuthError("invalid_audience", "Selecione ao menos um aluno.", 422)
    if audience == "this_client" and not spec.get("client_id"):
        raise AuthError("invalid_audience", "Selecione o aluno da rotina.", 422)
    spec["audience"] = audience
    return spec
