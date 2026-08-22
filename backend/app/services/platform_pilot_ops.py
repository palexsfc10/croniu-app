"""Platform pilot ops: integrity, timeline, AI runs, sanitized errors."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.agent import (
    AgentAuditLog,
    AgentPendingAction,
    AgentRun,
    AgentThread,
    AgentToolCall,
)
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.cycle import Cycle
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.service import Service
from app.models.user import User
from app.models.user_feedback import UserFeedback


def _planned_sessions(cycle: Cycle) -> int | None:
    if cycle.lesson_count is not None and cycle.lesson_count >= 0:
        return int(cycle.lesson_count)
    return None


def _integrity_status(planned: int | None, actual: int) -> str:
    if planned is None:
        return "unknown"
    if planned == 0 and actual == 0:
        return "intact"
    if planned > 0 and actual == 0:
        return "critical"
    if planned == actual:
        return "intact"
    return "divergent"


def _cycle_origin(db: Session, cycle: Cycle) -> str:
    pending = db.scalar(
        select(AgentPendingAction)
        .where(
            AgentPendingAction.organization_id == cycle.organization_id,
            AgentPendingAction.status == "executed",
            or_(
                AgentPendingAction.result_entity_id == str(cycle.id),
                AgentPendingAction.tool_name.in_(
                    ("execute_create_cycle", "propose_create_cycle", "create_cycle")
                ),
            ),
        )
        .order_by(AgentPendingAction.executed_at.desc().nullslast())
        .limit(1)
    )
    if pending is not None and (
        pending.result_entity_id == str(cycle.id)
        or (pending.result_safe or {}).get("cycle_id") == str(cycle.id)
    ):
        return "assistant"
    if cycle.idempotency_key and str(cycle.idempotency_key).startswith("agent:"):
        return "assistant"
    return "manual"


def list_cycle_agenda_integrity(
    db: Session,
    *,
    organization_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 30,
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 50)

    appt_count = (
        select(
            Appointment.cycle_id.label("cycle_id"),
            func.count().label("appointments_count"),
            func.max(Appointment.created_at).label("last_appointment_at"),
        )
        .where(
            Appointment.cycle_id.is_not(None),
            Appointment.status != "cancelled",
        )
        .group_by(Appointment.cycle_id)
        .subquery()
    )

    query = (
        select(
            Cycle,
            Organization.name,
            appt_count.c.appointments_count,
            appt_count.c.last_appointment_at,
        )
        .join(Organization, Organization.id == Cycle.organization_id)
        .outerjoin(appt_count, appt_count.c.cycle_id == Cycle.id)
        .order_by(Cycle.created_at.desc())
    )
    if organization_id is not None:
        query = query.where(Cycle.organization_id == organization_id)

    rows = list(db.execute(query).all())
    items: list[dict] = []
    summary = {
        "intact": 0,
        "divergent": 0,
        "critical": 0,
        "unknown": 0,
        "orphan_appointments": 0,
    }

    orphan_q = select(func.count()).select_from(Appointment).where(
        Appointment.cycle_id.is_not(None),
        ~Appointment.cycle_id.in_(select(Cycle.id)),
    )
    if organization_id is not None:
        orphan_q = orphan_q.where(Appointment.organization_id == organization_id)
    summary["orphan_appointments"] = int(db.scalar(orphan_q) or 0)

    for cycle, org_name, appt_n, last_appt in rows:
        planned = _planned_sessions(cycle)
        actual = int(appt_n or 0)
        integrity = _integrity_status(planned, actual)
        summary[integrity] = summary.get(integrity, 0) + 1
        if status_filter and integrity != status_filter:
            continue
        items.append(
            {
                "cycle_id": str(cycle.id),
                "organization_id": str(cycle.organization_id),
                "organization_name": org_name,
                "cycle_status": cycle.status,
                "planned_sessions": planned,
                "appointments_created": actual,
                "integrity": integrity,
                "origin": _cycle_origin(db, cycle),
                "last_appointment_at": last_appt.isoformat() if last_appt else None,
                "created_at": cycle.created_at.isoformat() if cycle.created_at else None,
                "idempotency_key_present": bool(cycle.idempotency_key),
            }
        )

    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": summary,
        "generated_at": datetime.now(UTC).isoformat(),
        "note": "Indicador apenas — sem reparo automático.",
    }


def get_organization_timeline(db: Session, organization_id: uuid.UUID) -> dict | None:
    org = db.get(Organization, organization_id)
    if org is None:
        return None

    events: list[dict] = []

    def add(kind: str, label: str, at: datetime | None, meta: dict | None = None) -> None:
        if at is None:
            return
        events.append(
            {
                "kind": kind,
                "label": label,
                "occurred_at": at.isoformat(),
                "metadata_safe": meta or {},
            }
        )

    add("organization_created", "Cadastro da organização", org.created_at)

    owner = db.scalar(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.organization_id == organization_id, Membership.role == "owner")
        .order_by(Membership.created_at.asc())
    )
    if owner and owner.last_login_at:
        add(
            "login",
            "Último acesso do profissional",
            owner.last_login_at,
            {"user_id": str(owner.id)},
        )

    first_client = db.scalar(
        select(Client)
        .where(
            Client.organization_id == organization_id,
            Client.status != "pending_duplicate_review",
        )
        .order_by(Client.created_at.asc())
        .limit(1)
    )
    if first_client:
        add(
            "first_client",
            "Primeiro cliente cadastrado",
            first_client.created_at,
            {"client_id": str(first_client.id)},
        )

    first_service = db.scalar(
        select(Service)
        .where(Service.organization_id == organization_id)
        .order_by(Service.created_at.asc())
        .limit(1)
    )
    if first_service:
        add(
            "first_service",
            "Primeiro serviço criado",
            first_service.created_at,
            {"service_id": str(first_service.id)},
        )

    first_cycle = db.scalar(
        select(Cycle)
        .where(Cycle.organization_id == organization_id)
        .order_by(Cycle.created_at.asc())
        .limit(1)
    )
    if first_cycle:
        add(
            "first_cycle",
            "Primeiro ciclo criado",
            first_cycle.created_at,
            {"cycle_id": str(first_cycle.id)},
        )

    first_cycle_appt = db.scalar(
        select(Appointment)
        .where(
            Appointment.organization_id == organization_id,
            Appointment.cycle_id.is_not(None),
        )
        .order_by(Appointment.created_at.asc())
        .limit(1)
    )
    if first_cycle_appt:
        add(
            "appointments_materialized",
            "Compromissos materializados na agenda",
            first_cycle_appt.created_at,
            {"cycle_id": str(first_cycle_appt.cycle_id)},
        )

    first_thread = db.scalar(
        select(AgentThread)
        .where(AgentThread.organization_id == organization_id)
        .order_by(AgentThread.created_at.asc())
        .limit(1)
    )
    if first_thread:
        add(
            "first_ai_conversation",
            "Primeira conversa com a IA",
            first_thread.created_at,
            {"thread_id": str(first_thread.id)},
        )

    first_confirmed = db.scalar(
        select(AgentPendingAction)
        .where(
            AgentPendingAction.organization_id == organization_id,
            AgentPendingAction.status == "executed",
        )
        .order_by(
            AgentPendingAction.executed_at.asc().nullslast(),
            AgentPendingAction.created_at.asc(),
        )
        .limit(1)
    )
    if first_confirmed:
        add(
            "first_proposal_confirmed",
            "Primeira proposta confirmada",
            first_confirmed.executed_at or first_confirmed.created_at,
            {
                "tool_name": first_confirmed.tool_name,
                "action_id": str(first_confirmed.id),
            },
        )

    first_feedback = db.scalar(
        select(UserFeedback)
        .where(UserFeedback.organization_id == organization_id)
        .order_by(UserFeedback.created_at.asc())
        .limit(1)
    )
    if first_feedback:
        add(
            "feedback_sent",
            "Feedback enviado",
            first_feedback.created_at,
            {
                "feedback_id": str(first_feedback.id),
                "category": first_feedback.category,
            },
        )

    recent_error = db.scalar(
        select(AgentRun)
        .where(
            AgentRun.organization_id == organization_id,
            AgentRun.status.in_(("error", "failed")),
        )
        .order_by(AgentRun.started_at.desc())
        .limit(1)
    )
    if recent_error:
        add(
            "ai_error",
            "Erro operacional de IA",
            recent_error.finished_at or recent_error.started_at,
            {
                "run_id": str(recent_error.id),
                "error_code": recent_error.error_code,
                "provider": recent_error.provider,
                "model": recent_error.model,
            },
        )

    events.sort(key=lambda e: e["occurred_at"])
    return {
        "organization_id": str(organization_id),
        "organization_name": org.name,
        "events": events,
        "generated_at": datetime.now(UTC).isoformat(),
    }


def list_ai_runs(
    db: Session,
    *,
    organization_id: uuid.UUID | None = None,
    status: str | None = None,
    proposal_status: str | None = None,
    message_type: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    page: int = 1,
    page_size: int = 30,
) -> dict:
    """Metadata-only AI runs — never returns conversation bodies."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 50)

    query = select(AgentRun).order_by(AgentRun.started_at.desc())
    count_q = select(func.count()).select_from(AgentRun)

    if organization_id is not None:
        query = query.where(AgentRun.organization_id == organization_id)
        count_q = count_q.where(AgentRun.organization_id == organization_id)
    if status:
        query = query.where(AgentRun.status == status)
        count_q = count_q.where(AgentRun.status == status)
    if created_from is not None:
        query = query.where(AgentRun.started_at >= created_from)
        count_q = count_q.where(AgentRun.started_at >= created_from)
    if created_to is not None:
        query = query.where(AgentRun.started_at <= created_to)
        count_q = count_q.where(AgentRun.started_at <= created_to)

    total = int(db.scalar(count_q) or 0)
    runs = list(db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all())

    org_ids = {r.organization_id for r in runs}
    user_ids = {r.user_id for r in runs}
    orgs = {
        o.id: o.name
        for o in db.scalars(select(Organization).where(Organization.id.in_(org_ids))).all()
    } if org_ids else {}
    users = {
        u.id: u.full_name
        for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}

    items: list[dict] = []
    for run in runs:
        tools = list(
            db.scalars(
                select(AgentToolCall)
                .where(AgentToolCall.run_id == run.id)
                .order_by(AgentToolCall.created_at.asc())
            ).all()
        )
        pending = list(
            db.scalars(
                select(AgentPendingAction)
                .where(
                    AgentPendingAction.organization_id == run.organization_id,
                    AgentPendingAction.user_id == run.user_id,
                    AgentPendingAction.thread_id == run.thread_id,
                    AgentPendingAction.created_at
                    >= run.started_at - timedelta(minutes=2),
                    AgentPendingAction.created_at
                    <= (run.finished_at or run.started_at) + timedelta(minutes=5),
                )
                .order_by(AgentPendingAction.created_at.desc())
                .limit(3)
            ).all()
        )

        if proposal_status:
            aliases = {
                "awaiting_confirmation": "pending",
                "confirmed": "executed",
                "cancelled": "cancelled",
                "error": "failed",
                "success": "executed",
            }
            wanted = aliases.get(proposal_status, proposal_status)
            if not any(p.status == wanted for p in pending):
                continue

        if message_type in {"text", "voice"}:
            has_voice = any(
                "transcrib" in (t.tool_name or "").lower()
                or "voice" in (t.tool_name or "").lower()
                for t in tools
            )
            if message_type == "voice" and not has_voice:
                continue
            if message_type == "text" and has_voice:
                continue

        primary_pending = pending[0] if pending else None
        items.append(
            {
                "run_id": str(run.id),
                "organization_id": str(run.organization_id),
                "organization_name": orgs.get(run.organization_id),
                "user_id": str(run.user_id),
                "professional_name": users.get(run.user_id),
                "thread_id": str(run.thread_id),
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                "provider": run.provider,
                "model": run.model,
                "status": run.status,
                "latency_ms": run.latency_ms,
                "input_tokens": run.input_tokens,
                "output_tokens": run.output_tokens,
                "estimated_cost_cents": run.estimated_cost_cents,
                "provider_request_id": run.provider_request_id,
                "error_code": run.error_code,
                "tools_requested": [t.tool_name for t in tools],
                "tools_executed": [
                    {
                        "name": t.tool_name,
                        "status": t.status,
                        "latency_ms": t.latency_ms,
                    }
                    for t in tools
                ],
                "proposal": (
                    {
                        "action_id": str(primary_pending.id),
                        "tool_name": primary_pending.tool_name,
                        "status": primary_pending.status,
                        "error_sanitized": primary_pending.error_sanitized,
                        "request_id": primary_pending.request_id,
                    }
                    if primary_pending
                    else None
                ),
                "sensitive_content_hidden": True,
            }
        )

    filtered = bool(proposal_status or message_type)
    return {
        "items": items,
        "total": len(items) if filtered else total,
        "page": page,
        "page_size": page_size,
        "generated_at": datetime.now(UTC).isoformat(),
        "note": "Conteúdo de conversas não é exposto. Apenas metadados operacionais.",
    }


def list_sanitized_errors(
    db: Session,
    *,
    organization_id: uuid.UUID | None = None,
    limit: int = 50,
) -> dict:
    """Minimal error board from agent runs + agent audit — no secrets/stacks."""
    limit = min(max(limit, 1), 100)
    since = datetime.now(UTC) - timedelta(days=14)

    run_q = (
        select(AgentRun)
        .where(
            AgentRun.started_at >= since,
            or_(
                AgentRun.status.in_(("error", "failed")),
                AgentRun.error_code.is_not(None),
            ),
        )
        .order_by(AgentRun.started_at.desc())
        .limit(limit)
    )
    if organization_id is not None:
        run_q = run_q.where(AgentRun.organization_id == organization_id)
    runs = list(db.scalars(run_q).all())

    audit_q = (
        select(AgentAuditLog)
        .where(
            AgentAuditLog.created_at >= since,
            AgentAuditLog.status.in_(("error", "failed", "denied")),
        )
        .order_by(AgentAuditLog.created_at.desc())
        .limit(limit)
    )
    if organization_id is not None:
        audit_q = audit_q.where(AgentAuditLog.organization_id == organization_id)
    audits = list(db.scalars(audit_q).all())

    buckets: dict[str, dict] = {}

    def bump(
        key: str,
        *,
        service: str,
        operation: str,
        org_id: uuid.UUID | None,
        code: str | None,
        message: str | None,
        at: datetime,
        correlation_id: str | None,
    ) -> None:
        row = buckets.get(key)
        if row is None:
            buckets[key] = {
                "key": key,
                "service": service,
                "operation": operation,
                "organization_id": str(org_id) if org_id else None,
                "error_code": code,
                "message_sanitized": ((message or "")[:240] or None),
                "occurrences": 1,
                "first_seen_at": at.isoformat(),
                "last_seen_at": at.isoformat(),
                "correlation_id": correlation_id,
                "investigation_status": "new",
            }
        else:
            row["occurrences"] += 1
            row["last_seen_at"] = at.isoformat()
            if correlation_id:
                row["correlation_id"] = correlation_id

    for run in runs:
        bump(
            f"agent_run:{run.error_code or run.status}:{run.organization_id}",
            service="api-ai",
            operation="agent_run",
            org_id=run.organization_id,
            code=run.error_code or run.status,
            message=run.error_code,
            at=run.finished_at or run.started_at,
            correlation_id=run.provider_request_id,
        )

    for audit in audits:
        bump(
            f"agent_audit:{audit.operation}:{audit.error_sanitized or audit.status}:{audit.organization_id}",
            service="api-ai",
            operation=audit.operation,
            org_id=audit.organization_id,
            code=audit.status,
            message=audit.error_sanitized,
            at=audit.created_at,
            correlation_id=audit.request_id,
        )

    items = sorted(buckets.values(), key=lambda r: r["last_seen_at"], reverse=True)[:limit]
    return {
        "items": items,
        "total": len(items),
        "generated_at": datetime.now(UTC).isoformat(),
        "note": "Visão mínima sanitizada. Sem payloads, tokens, cookies ou stack traces.",
    }
