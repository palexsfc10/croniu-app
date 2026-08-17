"""On-demand operational pendencies from published plans + stored decisions."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client
from app.models.intake import OperationalOccurrence, Protocol
from app.models.organization import Organization
from app.services import plan_cadence as cadence
from app.services import routine_occurrences as occ_svc
from app.services import routines as routine_svc
from app.services import status_labels
from app.services.auth import AuthError

logger = logging.getLogger("croniu.pendencies")

DEFAULT_ROUTINE = {
    "review_weekday": None,
    "feedback_weekday": None,
    "review_interval_days": None,
    "feedback_interval_days": None,
    "plan_ending_lead_days": 7,
    "renewal_lead_days": 7,
    "review_lead_days": 6,
}

OCCURRENCE_TYPES = {
    "plan_review",
    "plan_ending",
    "feedback_due",
    "evaluation_review",
    "cycle_renewal",
    "custom_task",
}
DECISION_STATUSES = {"completed", "deferred", "dismissed", "cancelled"}


def org_today(tz_name: str, now: datetime | None = None) -> date:
    now = now or datetime.now(UTC)
    try:
        tz = ZoneInfo(tz_name or "America/Sao_Paulo")
    except Exception:
        tz = ZoneInfo("America/Sao_Paulo")
    return now.astimezone(tz).date()


def routine_defaults(org: Organization) -> dict[str, Any]:
    stored = org.routine_defaults if isinstance(org.routine_defaults, dict) else {}
    merged = dict(DEFAULT_ROUTINE)
    merged.update(
        {
            k: v
            for k, v in stored.items()
            if k in DEFAULT_ROUTINE or k.endswith("_weekday") or k.endswith("_days")
        }
    )
    return merged


def preferred_weekday(defaults: dict[str, Any], occurrence_type: str) -> int | None:
    if occurrence_type == "plan_review":
        return defaults.get("review_weekday")
    if occurrence_type == "feedback_due":
        return defaults.get("feedback_weekday")
    if occurrence_type == "plan_ending":
        return defaults.get("review_weekday")
    if occurrence_type == "cycle_renewal":
        return defaults.get("renewal_weekday")
    return None


def _idempotency_key(kind: str, protocol_id: uuid.UUID, due_on: date) -> str:
    return f"{kind}:{protocol_id}:{due_on.isoformat()}"


def _protocol_start(protocol: Protocol) -> date | None:
    if protocol.starts_on:
        return protocol.starts_on
    if protocol.effective_from:
        return protocol.effective_from
    published = [v for v in (protocol.versions or []) if v.status == "published" and v.published_at]
    if published:
        latest = max(published, key=lambda v: v.version_number)
        return latest.published_at.date()
    return None


def _milestones_for(protocol: Protocol) -> list[cadence.Milestone]:
    start = _protocol_start(protocol)
    if start is None:
        return []
    interval = protocol.review_recurrence_days
    return cadence.plan_milestones(
        starts_on=start,
        duration_value=protocol.duration_value,
        duration_unit=protocol.duration_unit,
        ends_on=protocol.ends_on,
        review_interval_days=interval,
        feedback_interval_days=protocol.feedback_interval_days,
    )


def materialize_protocol(
    db: Session,
    *,
    org: Organization,
    protocol: Protocol,
    today: date,
) -> None:
    if protocol.status != "published" or protocol.client_id is None:
        return
    defaults = routine_defaults(org)
    lead = int(defaults.get("review_lead_days") or 6)
    existing = {
        row.idempotency_key: row
        for row in db.scalars(
            select(OperationalOccurrence).where(
                OperationalOccurrence.organization_id == org.id,
                OperationalOccurrence.protocol_id == protocol.id,
            )
        ).all()
    }
    for milestone in _milestones_for(protocol):
        key = _idempotency_key(milestone.kind, protocol.id, milestone.due_on)
        op_date = cadence.operational_date(
            due_on=milestone.due_on,
            preferred_weekday=preferred_weekday(defaults, milestone.kind),
            today=today,
            lead_days=lead,
        )
        row = existing.get(key)
        if row is None:
            row = OperationalOccurrence(
                id=uuid.uuid4(),
                organization_id=org.id,
                client_id=protocol.client_id,
                protocol_id=protocol.id,
                occurrence_type=milestone.kind,
                status="open",
                due_on=milestone.due_on,
                operational_date=op_date,
                source="computed",
                idempotency_key=key,
                meta={"index": milestone.index},
            )
            db.add(row)
            continue
        if row.status == "open":
            row.operational_date = op_date
            db.add(row)


TASK_TYPE_TO_OCCURRENCE = occ_svc.TASK_TYPE_TO_OCCURRENCE


def materialize_routines(
    db: Session,
    *,
    organization_id: uuid.UUID,
    today: date,
) -> None:
    occ_svc.ensure_routine_occurrences(
        db,
        organization_id=organization_id,
        range_start=today,
        range_end=today,
        commit=False,
    )


def materialize_org(db: Session, *, organization_id: uuid.UUID, today: date | None = None) -> date:
    org = db.get(Organization, organization_id)
    if org is None:
        raise AuthError("org_not_found", "Organização não encontrada.", 404)
    today = today or org_today(org.timezone)
    protocols = list(
        db.scalars(
            select(Protocol)
            .where(
                Protocol.organization_id == organization_id,
                Protocol.status == "published",
                Protocol.client_id.is_not(None),
            )
            .options(selectinload(Protocol.versions))
        ).all()
    )
    clients = {
        c.id: c
        for c in db.scalars(
            select(Client).where(Client.organization_id == organization_id)
        ).all()
    }
    for protocol in protocols:
        client = clients.get(protocol.client_id) if protocol.client_id else None
        if client is None or client.status == "archived":
            continue
        materialize_protocol(db, org=org, protocol=protocol, today=today)
    occ_svc.ensure_routine_occurrences(
        db,
        organization_id=organization_id,
        range_start=today - timedelta(days=14),
        range_end=today + timedelta(days=1),
        commit=False,
    )
    db.commit()
    logger.info(
        "pendencies_materialized org=%s count_protocols=%s today=%s",
        organization_id,
        len(protocols),
        today.isoformat(),
    )
    return today


def _item_out(
    row: OperationalOccurrence,
    *,
    client_name: str | None,
    plan_title: str | None,
    today: date,
) -> dict[str, Any]:
    overdue = row.due_on < today and row.status == "open"
    weekday = cadence.weekday_label(row.operational_date.weekday())
    return {
        "id": str(row.id),
        "client_id": str(row.client_id) if row.client_id else None,
        "client_name": client_name,
        "protocol_id": str(row.protocol_id) if row.protocol_id else None,
        "plan_title": plan_title,
        "occurrence_type": row.occurrence_type,
        "type_label": status_labels.occurrence_type_label(row.occurrence_type),
        "status": row.status,
        "status_label": status_labels.occurrence_status_label(row.status),
        "due_on": row.due_on.isoformat(),
        "operational_date": row.operational_date.isoformat(),
        "deferred_until": row.deferred_until.isoformat() if row.deferred_until else None,
        "overdue": overdue,
        "operational_weekday_label": weekday,
        "reason": row.reason,
        "source": row.source,
        "name": (row.meta or {}).get("name") if isinstance(row.meta, dict) else None,
        "time": (row.meta or {}).get("time") if isinstance(row.meta, dict) else None,
        "routine_id": (row.meta or {}).get("routine_id") if isinstance(row.meta, dict) else None,
    }


def board(
    db: Session,
    *,
    organization_id: uuid.UUID,
    today: date | None = None,
    bucket: str | None = None,
    client_id: uuid.UUID | None = None,
    on: date | None = None,
) -> dict[str, Any]:
    today = materialize_org(db, organization_id=organization_id, today=today)
    if on is not None:
        occ_svc.persist_for_day(db, organization_id=organization_id, day=on)
    if client_id is not None:
        owned = db.scalar(
            select(Client).where(
                Client.id == client_id,
                Client.organization_id == organization_id,
            )
        )
        if owned is None:
            raise AuthError("client_not_found", "Cliente não encontrado.", 404)
    rows = list(
        db.scalars(
            select(OperationalOccurrence).where(
                OperationalOccurrence.organization_id == organization_id
            )
        ).all()
    )
    clients = {
        c.id: c.full_name
        for c in db.scalars(select(Client).where(Client.organization_id == organization_id)).all()
    }
    protocols = {
        p.id: p.title
        for p in db.scalars(
            select(Protocol).where(Protocol.organization_id == organization_id)
        ).all()
    }

    def include(row: OperationalOccurrence) -> bool:
        if row.status in {"cancelled"}:
            return False
        if row.status == "completed":
            return False
        if row.status == "dismissed":
            return False
        if on is not None:
            if row.status == "deferred":
                until = row.deferred_until or row.operational_date
                return until == on
            if row.status != "open":
                return False
            if row.operational_date == on:
                return True
            return on == today and row.due_on < today
        if row.status == "deferred":
            until = row.deferred_until or row.operational_date
            return until <= today
        if bucket == "overdue":
            return row.due_on < today and row.status == "open"
        if bucket == "today":
            return row.operational_date <= today and row.status == "open"
        if bucket == "upcoming":
            return row.operational_date > today and row.status == "open"
        return True

    visible = [r for r in rows if include(r)]
    if client_id is not None:
        visible = [r for r in visible if r.client_id == client_id]
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in visible:
        item = _item_out(
            row,
            client_name=clients.get(row.client_id) if row.client_id else None,
            plan_title=protocols.get(row.protocol_id) if row.protocol_id else None,
            today=today,
        )
        groups.setdefault(row.occurrence_type, []).append(item)

    summaries = []
    order = [
        "plan_review",
        "feedback_due",
        "plan_ending",
        "cycle_renewal",
        "evaluation_review",
        "custom_task",
    ]
    for kind in order:
        items = groups.get(kind) or []
        if not items:
            continue
        items.sort(key=lambda i: (i["due_on"], i["client_name"] or ""))
        client_ids = {i["client_id"] for i in items if i.get("client_id")}
        summaries.append(
            {
                "occurrence_type": kind,
                "label": status_labels.occurrence_type_label(kind),
                "count": len(items),
                "occurrence_count": len(items),
                "client_count": len(client_ids),
                "overdue_count": sum(1 for i in items if i["overdue"]),
                "items": items,
            }
        )
    return {"today": today.isoformat(), "groups": summaries}


def get_occurrence(
    db: Session, *, organization_id: uuid.UUID, occurrence_id: uuid.UUID
) -> OperationalOccurrence:
    row = db.scalar(
        select(OperationalOccurrence).where(
            OperationalOccurrence.id == occurrence_id,
            OperationalOccurrence.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("occurrence_not_found", "Pendência não encontrada.", 404)
    return row


def complete_occurrences(
    db: Session,
    *,
    organization_id: uuid.UUID,
    occurrence_ids: list[uuid.UUID],
    reason: str | None = None,
) -> list[OperationalOccurrence]:
    """Complete a bounded owned set in one transaction or change nothing."""
    unique_ids = list(dict.fromkeys(occurrence_ids))
    if not unique_ids or len(unique_ids) > 20:
        raise AuthError(
            "invalid_occurrence_batch",
            "Selecione entre 1 e 20 pendências.",
            422,
        )
    rows = list(
        db.scalars(
            select(OperationalOccurrence)
            .where(
                OperationalOccurrence.organization_id == organization_id,
                OperationalOccurrence.id.in_(unique_ids),
            )
            .with_for_update()
        ).all()
    )
    by_id = {row.id: row for row in rows}
    if len(by_id) != len(unique_ids):
        raise AuthError("occurrence_not_found", "Pendência não encontrada.", 404)
    ordered = [by_id[item_id] for item_id in unique_ids]
    if any(row.status not in {"open", "deferred"} for row in ordered):
        raise AuthError(
            "occurrence_not_actionable",
            "Uma ou mais pendências já não podem ser concluídas.",
            409,
        )

    now = datetime.now(UTC)
    try:
        for row in ordered:
            row.status = "completed"
            row.completed_at = now
            row.reason = (reason or "")[:500] or None
            if row.protocol_id and row.occurrence_type in {"plan_review", "feedback_due"}:
                protocol = db.scalar(
                    select(Protocol).where(
                        Protocol.id == row.protocol_id,
                        Protocol.organization_id == organization_id,
                    )
                )
                if protocol is None:
                    raise AuthError("protocol_not_found", "Plano não encontrado.", 404)
                if row.occurrence_type == "plan_review":
                    protocol.last_review_on = row.due_on
                else:
                    protocol.last_feedback_on = row.due_on
                    protocol.next_feedback_on = (
                        row.due_on + timedelta(days=protocol.feedback_interval_days)
                        if protocol.feedback_interval_days
                        else None
                    )
                db.add(protocol)
            meta = row.meta if isinstance(row.meta, dict) else {}
            routine_id = meta.get("routine_id")
            if routine_id:
                try:
                    parsed_routine_id = uuid.UUID(str(routine_id))
                except ValueError as exc:
                    raise AuthError(
                        "invalid_routine_reference",
                        "Referência de rotina inválida.",
                        409,
                    ) from exc
                routine_svc.complete_routine(
                    db,
                    organization_id=organization_id,
                    task_id=parsed_routine_id,
                    today=row.due_on,
                    occurrence_on=row.due_on,
                    commit=False,
                )
            db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        raise
    for row in ordered:
        db.refresh(row)
        logger.info(
            "occurrence_decided org=%s type=%s status=completed key=%s",
            organization_id,
            row.occurrence_type,
            row.idempotency_key,
        )
    return ordered


def decide(
    db: Session,
    *,
    organization_id: uuid.UUID,
    occurrence_id: uuid.UUID,
    status: str,
    deferred_until: date | None = None,
    reason: str | None = None,
) -> OperationalOccurrence:
    if status not in DECISION_STATUSES:
        raise AuthError("invalid_status", "Decisão inválida.", 422)
    row = get_occurrence(db, organization_id=organization_id, occurrence_id=occurrence_id)
    row.status = status
    row.reason = (reason or "")[:500] or None
    if status == "completed":
        row.completed_at = datetime.now(UTC)
        if row.protocol_id and row.occurrence_type in {"plan_review", "feedback_due"}:
            protocol = db.get(Protocol, row.protocol_id)
            if protocol and protocol.organization_id == organization_id:
                if row.occurrence_type == "plan_review":
                    protocol.last_review_on = row.due_on
                else:
                    protocol.last_feedback_on = row.due_on
                    protocol.next_feedback_on = (
                        row.due_on + timedelta(days=protocol.feedback_interval_days)
                        if protocol.feedback_interval_days
                        else None
                    )
                db.add(protocol)
    if status == "deferred":
        if deferred_until is None:
            raise AuthError("invalid_defer", "Informe a nova data.", 422)
        row.deferred_until = deferred_until
        row.operational_date = deferred_until
    db.add(row)
    db.commit()
    db.refresh(row)
    meta = row.meta if isinstance(row.meta, dict) else {}
    routine_id = meta.get("routine_id")
    if status == "completed" and routine_id:
        try:
            rid = uuid.UUID(str(routine_id))
            routine_svc.complete_routine(
                db,
                organization_id=organization_id,
                task_id=rid,
                today=row.due_on,
                occurrence_on=row.due_on,
            )
        except (ValueError, AuthError):
            logger.exception("routine_complete_from_occurrence failed key=%s", row.idempotency_key)
    logger.info(
        "occurrence_decided org=%s type=%s status=%s key=%s",
        organization_id,
        row.occurrence_type,
        status,
        row.idempotency_key,
    )
    return row


def extend_plan(
    db: Session,
    *,
    organization_id: uuid.UUID,
    protocol_id: uuid.UUID,
    extra_value: int,
    extra_unit: str,
    note: str | None = None,
) -> Protocol:
    protocol = db.scalar(
        select(Protocol)
        .where(Protocol.id == protocol_id, Protocol.organization_id == organization_id)
        .options(selectinload(Protocol.versions))
    )
    if protocol is None:
        raise AuthError("protocol_not_found", "Plano não encontrado.", 404)
    start = _protocol_start(protocol)
    if start is None:
        raise AuthError("no_start", "Defina a data de início antes de prorrogar.", 422)
    current_end = cadence.compute_ends_on(
        starts_on=start,
        duration_value=protocol.duration_value,
        duration_unit=protocol.duration_unit,
        ends_on=protocol.ends_on,
    )
    base = current_end or start
    new_end = cadence.add_duration(base, extra_value, extra_unit)
    protocol.ends_on = new_end
    protocol.extension_note = (note or "")[:500] or protocol.extension_note
    db.add(protocol)
    # Future open ending/review occurrences beyond old end stay; cancel open ending at old date
    if current_end:
        old_key = _idempotency_key("plan_ending", protocol.id, current_end)
        old = db.scalar(
            select(OperationalOccurrence).where(
                OperationalOccurrence.organization_id == organization_id,
                OperationalOccurrence.idempotency_key == old_key,
            )
        )
        if old and old.status == "open":
            old.status = "cancelled"
            db.add(old)
    db.commit()
    org = db.get(Organization, organization_id)
    if org:
        materialize_protocol(db, org=org, protocol=protocol, today=org_today(org.timezone))
        db.commit()
    return protocol


def client_next_actions(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
) -> list[dict[str, Any]]:
    org = db.get(Organization, organization_id)
    today = org_today(org.timezone if org else "America/Sao_Paulo")
    materialize_org(db, organization_id=organization_id, today=today)
    rows = list(
        db.scalars(
            select(OperationalOccurrence).where(
                OperationalOccurrence.organization_id == organization_id,
                OperationalOccurrence.client_id == client_id,
                OperationalOccurrence.status == "open",
            )
        ).all()
    )
    rows.sort(key=lambda r: (r.due_on, r.occurrence_type))
    return [
        _item_out(r, client_name=None, plan_title=None, today=today)
        for r in rows
    ]
