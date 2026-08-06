"""Agent tool catalog — allowlisted only; tenant always from auth context.

Read tools only ever return data already scoped to `ctx.organization_id`.
Write tools never execute directly: they return `needs_confirmation` and the
orchestrator turns that into a pending action. Actual execution happens in
`app.agent.confirmation` via the paired `execute_*` function, which always
calls a domain/agenda/evaluation service — never raw SQL.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.agent.providers.base import ToolSpec
from app.models.client import Client
from app.models.client_evaluation import ClientEvaluation
from app.models.cycle import Cycle
from app.schemas.evaluations import EvaluationCreate
from app.services import agenda as agenda_svc
from app.services import domain as domain_svc
from app.services import evaluations as eval_svc
from app.services import my_cycle as my_cycle_svc
from app.services.auth import AuthError


class ToolContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    organization_id: uuid.UUID
    user_id: uuid.UUID
    db: Session
    request_id: str | None = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    kind: str  # read | write
    requires_confirmation: bool
    handler: Callable[[ToolContext, dict[str, Any]], dict[str, Any]]
    risk_class: str = "read"


# --------------------------------------------------------------------------
# Read tools — argument schemas
# --------------------------------------------------------------------------


class EmptyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ListTodayAppointmentsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ListEndingCyclesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    within_days: int = Field(default=7, ge=1, le=30)


class ListPendingReceivablesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FindClientArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name_query: str = Field(min_length=2, max_length=120)


class ListRecentEvaluationsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(default=5, ge=1, le=20)


class ListUpcomingAppointmentsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    within_days: int = Field(default=3, ge=1, le=14)
    limit: int = Field(default=20, ge=1, le=50)


class ClientIdArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID


class CycleIdArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cycle_id: uuid.UUID


class ListRenewalRequestsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str | None = Field(
        default=None,
        pattern="^(requested|acknowledged|payment_reported|resolved|dismissed)$",
    )


# --------------------------------------------------------------------------
# Read tools — handlers
# --------------------------------------------------------------------------


def _list_today_appointments(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    ListTodayAppointmentsArgs.model_validate(args)
    items = agenda_svc.list_today_appointments(ctx.db, organization_id=ctx.organization_id)
    return {
        "count": len(items),
        "appointments": [
            {
                "id": str(a.id),
                "client_name": a.client_name,
                "service_name": a.service_name,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
                "status": a.status,
            }
            for a in items
        ],
    }


def _get_today_summary(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    EmptyArgs.model_validate(args)
    summary = domain_svc.build_home_summary(ctx.db, organization_id=ctx.organization_id)
    priority = None
    if summary.priority_action is not None:
        priority = {
            "kind": summary.priority_action.kind,
            "title": summary.priority_action.title,
            "subtitle": summary.priority_action.subtitle,
        }
    return {
        "message": summary.message,
        "local_today": summary.local_today.isoformat(),
        "priority": priority,
        "upcoming_appointments": [
            {
                "id": str(a.id),
                "client_name": a.client_name,
                "service_name": a.service_name,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
            }
            for a in summary.upcoming_appointments[:10]
        ],
        "in_progress_appointments": [
            {
                "id": str(a.id),
                "client_name": a.client_name,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
            }
            for a in summary.in_progress_appointments[:10]
        ],
        "appointments_needing_outcome_count": len(summary.appointments_needing_outcome),
        "cycles_nearing_end_count": len(summary.cycles_nearing_end),
        "cycles_ended_unrenewed_count": len(summary.cycles_ended_unrenewed),
        "pending_payments_count": len(summary.pending_payments),
        "attention_count": len(summary.attention_items),
        "attention_items": [
            {"kind": i.kind, "title": i.title, "subtitle": i.subtitle}
            for i in summary.attention_items[:10]
        ],
    }


def _list_upcoming_appointments(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ListUpcomingAppointmentsArgs.model_validate(args)
    items = agenda_svc.list_upcoming_appointments(
        ctx.db,
        organization_id=ctx.organization_id,
        within_days=parsed.within_days,
        limit=parsed.limit,
    )
    return {
        "count": len(items),
        "appointments": [
            {
                "id": str(a.id),
                "client_name": a.client_name,
                "service_name": a.service_name,
                "starts_at": a.starts_at.isoformat() if a.starts_at else None,
                "ends_at": a.ends_at.isoformat() if a.ends_at else None,
                "status": a.status,
            }
            for a in items
        ],
    }


def _list_ending_cycles(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ListEndingCyclesArgs.model_validate(args)
    org = agenda_svc.get_organization(ctx.db, ctx.organization_id)
    today = agenda_svc.org_local_today(org)
    horizon = today + timedelta(days=parsed.within_days)
    rows = list(
        ctx.db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == ctx.organization_id,
                Cycle.status == "active",
                Cycle.ends_on >= today,
                Cycle.ends_on <= horizon,
            )
            .options(selectinload(Cycle.client), selectinload(Cycle.service))
            .order_by(Cycle.ends_on.asc())
        ).all()
    )
    return {
        "count": len(rows),
        "cycles": [
            {
                "id": str(c.id),
                "client_name": c.client.full_name if c.client else None,
                "service_name": c.service.name if c.service else None,
                "ends_on": c.ends_on.isoformat(),
            }
            for c in rows
        ],
    }


def _list_cycles_needing_attention(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    EmptyArgs.model_validate(args)
    summary = domain_svc.build_home_summary(ctx.db, organization_id=ctx.organization_id)

    def _cycle_item(c) -> dict[str, Any]:
        return {
            "id": str(c.id),
            "client_name": c.client_name,
            "service_name": c.service_name,
            "ends_on": c.ends_on.isoformat(),
            "lessons_remaining": c.lessons_remaining,
            "status": c.status,
        }

    return {
        "nearing_end": [_cycle_item(c) for c in summary.cycles_nearing_end],
        "ended_unrenewed": [_cycle_item(c) for c in summary.cycles_ended_unrenewed],
    }


def _get_cycle_details(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = CycleIdArgs.model_validate(args)
    cycle = domain_svc.get_cycle(
        ctx.db, organization_id=ctx.organization_id, cycle_id=parsed.cycle_id
    )
    out = domain_svc.cycle_to_out(ctx.db, cycle)
    return out.model_dump(mode="json")


def _list_pending_receivables(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    ListPendingReceivablesArgs.model_validate(args)
    summary = domain_svc.build_home_summary(ctx.db, organization_id=ctx.organization_id)
    pending = summary.pending_payments
    return {
        "count": len(pending),
        "receivables": [
            {
                "id": str(r.id),
                "client_name": r.client_name,
                "amount_cents": r.amount_cents,
                "due_on": r.due_on.isoformat() if isinstance(r.due_on, date) else str(r.due_on),
                "status": r.status,
            }
            for r in pending
        ],
    }


def _get_payment_status(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ClientIdArgs.model_validate(args)
    domain_svc.get_client(ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id)
    rows = domain_svc.list_receivables_for_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    pending = [r for r in rows if r.status in {"pending", "expected"}]
    return {
        "count": len(rows),
        "pending_count": len(pending),
        "receivables": [
            {
                "id": str(r.id),
                "amount_cents": r.amount_cents,
                "due_on": r.due_on.isoformat(),
                "status": r.status,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
            }
            for r in rows
        ],
    }


def _find_client(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = FindClientArgs.model_validate(args)
    q = parsed.name_query.strip().lower()
    clients = domain_svc.list_clients(ctx.db, organization_id=ctx.organization_id, status="active")
    matches = [c for c in clients if q in c.full_name.lower()]
    if not matches:
        # also try first name token
        token = q.split()[0]
        matches = [c for c in clients if token in c.full_name.lower()]
    if len(matches) > 1:
        return {
            "ambiguous": True,
            "message": "Encontrei mais de um cliente. Qual deles?",
            "candidates": [
                {"id": str(c.id), "full_name": c.full_name, "phone": c.phone} for c in matches[:8]
            ],
        }
    if len(matches) == 0:
        return {"ambiguous": False, "found": False, "message": "Nenhum cliente correspondente."}
    c = matches[0]
    return {
        "ambiguous": False,
        "found": True,
        "client": {
            "id": str(c.id),
            "full_name": c.full_name,
            "phone": c.phone,
            "email": c.email,
            "notes": c.notes,
            "status": c.status,
        },
    }


def _get_client_overview(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ClientIdArgs.model_validate(args)
    client = domain_svc.get_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    active_cycles = domain_svc.list_cycles(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id, status="active"
    )
    receivables = domain_svc.list_receivables_for_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    pending_receivables = [r for r in receivables if r.status in {"pending", "expected"}]
    evaluations = eval_svc.list_client_evaluations(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    return {
        "client": {
            "id": str(client.id),
            "full_name": client.full_name,
            "phone": client.phone,
            "email": client.email,
            "status": client.status,
        },
        "active_cycles": [
            {
                "id": str(c.id),
                "service_name": c.service_name,
                "ends_on": c.ends_on.isoformat(),
                "is_nearing_end": c.is_nearing_end,
            }
            for c in active_cycles
        ],
        "pending_receivables_count": len(pending_receivables),
        "evaluations_count": len(evaluations),
        "recent_evaluations": [
            {"id": str(e.id), "title": e.title, "status": e.status}
            for e in evaluations[:5]
        ],
    }


def _list_recent_evaluations(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ListRecentEvaluationsArgs.model_validate(args)
    rows = list(
        ctx.db.scalars(
            select(ClientEvaluation)
            .where(
                ClientEvaluation.organization_id == ctx.organization_id,
                ClientEvaluation.status == "published",
            )
            .options(selectinload(ClientEvaluation.criteria))
            .order_by(ClientEvaluation.published_at.desc())
            .limit(parsed.limit)
        ).all()
    )
    client_ids = {r.client_id for r in rows}
    names: dict[uuid.UUID, str] = {}
    if client_ids:
        for client in ctx.db.scalars(
            select(Client).where(
                Client.organization_id == ctx.organization_id, Client.id.in_(client_ids)
            )
        ):
            names[client.id] = client.full_name
    return {
        "count": len(rows),
        "evaluations": [
            {
                "id": str(r.id),
                "client_id": str(r.client_id),
                "client_name": names.get(r.client_id),
                "title": r.title,
                "published_at": r.published_at.isoformat() if r.published_at else None,
            }
            for r in rows
        ],
    }


def _list_client_evaluations(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ClientIdArgs.model_validate(args)
    rows = eval_svc.list_client_evaluations(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    return {
        "count": len(rows),
        "evaluations": [
            {
                "id": str(r.id),
                "title": r.title,
                "status": r.status,
                "published_at": r.published_at.isoformat() if r.published_at else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


def _list_renewal_requests(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ListRenewalRequestsArgs.model_validate(args)
    rows = my_cycle_svc.list_renewal_requests(
        ctx.db, organization_id=ctx.organization_id, status=parsed.status
    )
    return {
        "count": len(rows),
        "renewal_requests": [
            {
                "id": str(r.id),
                "client_name": r.client_name,
                "service_name": r.service_name,
                "status": r.status,
                "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            }
            for r in rows
        ],
    }


# --------------------------------------------------------------------------
# Write tools (propose_*) — argument schemas
# --------------------------------------------------------------------------


class ProposeCreateClientArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=320)
    notes: str | None = Field(default=None, max_length=2000)


class ProposeCreateAppointmentArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    service_id: uuid.UUID | None = None
    cycle_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def ends_after_start(self) -> ProposeCreateAppointmentArgs:
        if self.ends_at <= self.starts_at:
            raise ValueError("O fim deve ser posterior ao início.")
        return self


class ProposeRescheduleAppointmentArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    appointment_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def ends_after_start(self) -> ProposeRescheduleAppointmentArgs:
        if self.ends_at <= self.starts_at:
            raise ValueError("O fim deve ser posterior ao início.")
        return self


class ProposeCreateCycleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID
    service_id: uuid.UUID
    starts_on: date
    ends_on: date
    value_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    notes: str | None = Field(default=None, max_length=2000)
    create_receivable: bool = True
    receivable_due_on: date | None = None

    @model_validator(mode="after")
    def ends_after_start(self) -> ProposeCreateCycleArgs:
        if self.ends_on < self.starts_on:
            raise ValueError("A data de fim deve ser igual ou posterior ao início.")
        return self


class ProposeRecordPaymentArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receivable_id: uuid.UUID
    payment_method: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)


class ProposeMarkAppointmentOutcomeArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    appointment_id: uuid.UUID
    outcome: Literal["completed", "no_show"]


class ProposeCreateEvaluationDraftArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID
    title: str = Field(min_length=2, max_length=200)
    summary: str | None = Field(default=None, max_length=5000)
    client_message: str | None = Field(default=None, max_length=5000)


class ProposeAddMilestoneArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


# --------------------------------------------------------------------------
# Write tools — propose_* handlers (never execute; only validate + summarize)
# --------------------------------------------------------------------------


def _propose_create_client(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateClientArgs.model_validate(args)
    details = []
    if parsed.phone:
        details.append(f"telefone {parsed.phone}")
    if parsed.email:
        details.append(f"e-mail {parsed.email}")
    extra = f" ({', '.join(details)})" if details else ""
    return {
        "needs_confirmation": True,
        "tool_name": "propose_create_client",
        "arguments": parsed.model_dump(mode="json"),
        "summary": f"Criar cliente “{parsed.full_name}”{extra}.",
        "summary_fields": {"full_name": parsed.full_name, "phone": parsed.phone},
        "risk_class": "write_common",
    }


def execute_create_client(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateClientArgs.model_validate(arguments)
    row = domain_svc.create_client(
        ctx.db,
        organization_id=ctx.organization_id,
        full_name=parsed.full_name,
        phone=parsed.phone,
        email=parsed.email,
        notes=parsed.notes,
    )
    return {"id": str(row.id), "kind": "client", "full_name": row.full_name, "status": row.status}


def _propose_create_appointment(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateAppointmentArgs.model_validate(args)
    client = domain_svc.get_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    return {
        "needs_confirmation": True,
        "tool_name": "propose_create_appointment",
        "arguments": parsed.model_dump(mode="json"),
        "summary": (
            f"Agendar {client.full_name} em "
            f"{parsed.starts_at.strftime('%d/%m/%Y %H:%M')}."
        ),
        "summary_fields": {
            "client_name": client.full_name,
            "starts_at": parsed.starts_at.isoformat(),
            "ends_at": parsed.ends_at.isoformat(),
        },
        "risk_class": "write_common",
    }


def execute_create_appointment(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateAppointmentArgs.model_validate(arguments)
    row = agenda_svc.create_appointment(
        ctx.db,
        organization_id=ctx.organization_id,
        client_id=parsed.client_id,
        starts_at=parsed.starts_at,
        ends_at=parsed.ends_at,
        cycle_id=parsed.cycle_id,
        service_id=parsed.service_id,
        location_id=parsed.location_id,
        title=parsed.title,
        notes=parsed.notes,
    )
    return {"id": str(row.id), "kind": "appointment", "status": row.status}


def _propose_reschedule_appointment(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeRescheduleAppointmentArgs.model_validate(args)
    appointment = agenda_svc.get_appointment(
        ctx.db, organization_id=ctx.organization_id, appointment_id=parsed.appointment_id
    )
    client_name = appointment.client.full_name if appointment.client else "cliente"
    return {
        "needs_confirmation": True,
        "tool_name": "propose_reschedule_appointment",
        "arguments": parsed.model_dump(mode="json"),
        "summary": (
            f"Remarcar compromisso de {client_name} para "
            f"{parsed.starts_at.strftime('%d/%m/%Y %H:%M')}."
        ),
        "summary_fields": {
            "client_name": client_name,
            "starts_at": parsed.starts_at.isoformat(),
            "ends_at": parsed.ends_at.isoformat(),
        },
        "risk_class": "write_common",
    }


def execute_reschedule_appointment(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeRescheduleAppointmentArgs.model_validate(arguments)
    row = agenda_svc.update_appointment(
        ctx.db,
        organization_id=ctx.organization_id,
        appointment_id=parsed.appointment_id,
        fields={"starts_at": parsed.starts_at, "ends_at": parsed.ends_at},
    )
    return {"id": str(row.id), "kind": "appointment", "status": row.status}


def _propose_create_cycle(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateCycleArgs.model_validate(args)
    client = domain_svc.get_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    service = domain_svc.get_service(
        ctx.db, organization_id=ctx.organization_id, service_id=parsed.service_id
    )
    return {
        "needs_confirmation": True,
        "tool_name": "propose_create_cycle",
        "arguments": parsed.model_dump(mode="json"),
        "summary": (
            f"Criar ciclo de {service.name} para {client.full_name} "
            f"de {parsed.starts_on.isoformat()} a {parsed.ends_on.isoformat()}."
        ),
        "summary_fields": {
            "client_name": client.full_name,
            "service_name": service.name,
            "starts_on": parsed.starts_on.isoformat(),
            "ends_on": parsed.ends_on.isoformat(),
        },
        "risk_class": "write_common",
    }


def execute_create_cycle(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateCycleArgs.model_validate(arguments)
    cycle = domain_svc.create_cycle(
        ctx.db,
        organization_id=ctx.organization_id,
        client_id=parsed.client_id,
        service_id=parsed.service_id,
        starts_on=parsed.starts_on,
        ends_on=parsed.ends_on,
        value_cents=parsed.value_cents,
        notes=parsed.notes,
        create_receivable=parsed.create_receivable,
        receivable_due_on=parsed.receivable_due_on,
    )
    return {"id": str(cycle.id), "kind": "cycle", "status": cycle.status}


def _propose_record_payment(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeRecordPaymentArgs.model_validate(args)
    receivable = domain_svc.get_receivable(
        ctx.db, organization_id=ctx.organization_id, receivable_id=parsed.receivable_id
    )
    if receivable.status == "received":
        return {
            "error": "Este recebimento já está marcado como pago.",
            "code": "already_paid",
        }
    client_name = receivable.client.full_name if receivable.client else "cliente"
    amount = (receivable.amount_cents or 0) / 100
    return {
        "needs_confirmation": True,
        "tool_name": "propose_record_payment",
        "arguments": parsed.model_dump(mode="json"),
        "summary": f"Marcar recebimento de {client_name} (R$ {amount:.2f}) como pago.",
        "summary_fields": {
            "client_name": client_name,
            "amount_cents": receivable.amount_cents,
        },
        "risk_class": "write_sensitive",
    }


def execute_record_payment(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeRecordPaymentArgs.model_validate(arguments)
    row = domain_svc.mark_receivable_paid(
        ctx.db,
        organization_id=ctx.organization_id,
        receivable_id=parsed.receivable_id,
        payment_method=parsed.payment_method,
        notes=parsed.notes,
    )
    return {"id": str(row.id), "kind": "receivable", "status": row.status}


def _propose_mark_appointment_outcome(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeMarkAppointmentOutcomeArgs.model_validate(args)
    appointment = agenda_svc.get_appointment(
        ctx.db, organization_id=ctx.organization_id, appointment_id=parsed.appointment_id
    )
    client_name = appointment.client.full_name if appointment.client else "cliente"
    label = "realizado" if parsed.outcome == "completed" else "falta"
    return {
        "needs_confirmation": True,
        "tool_name": "propose_mark_appointment_outcome",
        "arguments": parsed.model_dump(mode="json"),
        "summary": f"Marcar compromisso de {client_name} como {label}.",
        "summary_fields": {"client_name": client_name, "outcome": parsed.outcome},
        "risk_class": "write_common",
    }


def execute_mark_appointment_outcome(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeMarkAppointmentOutcomeArgs.model_validate(arguments)
    row = agenda_svc.update_appointment(
        ctx.db,
        organization_id=ctx.organization_id,
        appointment_id=parsed.appointment_id,
        fields={"status": parsed.outcome},
    )
    return {"id": str(row.id), "kind": "appointment", "status": row.status}


def _propose_create_evaluation_draft(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateEvaluationDraftArgs.model_validate(args)
    client = domain_svc.get_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    return {
        "needs_confirmation": True,
        "tool_name": "propose_create_evaluation_draft",
        "arguments": parsed.model_dump(mode="json"),
        "summary": (
            f"Criar rascunho de avaliação “{parsed.title}” para o cliente {client.full_name}."
        ),
        "summary_fields": {"client_name": client.full_name, "title": parsed.title},
        "risk_class": "write_common",
    }


def execute_create_evaluation_draft(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeCreateEvaluationDraftArgs.model_validate(arguments)
    row = eval_svc.create_evaluation(
        ctx.db,
        organization_id=ctx.organization_id,
        client_id=parsed.client_id,
        author_user_id=ctx.user_id,
        payload=EvaluationCreate(
            title=parsed.title,
            summary=parsed.summary,
            client_message=parsed.client_message,
        ),
    )
    return {
        "id": str(row.id),
        "evaluation_id": str(row.id),
        "kind": "evaluation",
        "status": row.status,
        "title": row.title,
        "client_id": str(row.client_id),
    }


def _propose_add_milestone(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeAddMilestoneArgs.model_validate(args)
    client = domain_svc.get_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    return {
        "needs_confirmation": True,
        "tool_name": "propose_add_milestone",
        "arguments": parsed.model_dump(mode="json"),
        "summary": f"Registrar marco “{parsed.title}” para {client.full_name}.",
        "summary_fields": {"client_name": client.full_name, "title": parsed.title},
        "risk_class": "write_common",
    }


def execute_add_milestone(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    parsed = ProposeAddMilestoneArgs.model_validate(arguments)
    row = eval_svc.create_evaluation(
        ctx.db,
        organization_id=ctx.organization_id,
        client_id=parsed.client_id,
        author_user_id=ctx.user_id,
        payload=EvaluationCreate(
            title=f"Marco: {parsed.title}",
            summary=parsed.description,
        ),
    )
    return {
        "id": str(row.id),
        "evaluation_id": str(row.id),
        "kind": "milestone",
        "status": row.status,
        "title": row.title,
        "client_id": str(row.client_id),
    }


# --------------------------------------------------------------------------
# Catalog
# --------------------------------------------------------------------------

TOOLS: dict[str, ToolDefinition] = {
    # --- Read: agenda / home -------------------------------------------------
    "list_today_appointments": ToolDefinition(
        name="list_today_appointments",
        description="Lista os compromissos de hoje do profissional.",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        kind="read",
        requires_confirmation=False,
        handler=_list_today_appointments,
    ),
    "get_today_summary": ToolDefinition(
        name="get_today_summary",
        description=(
            "Resumo do dia: ação prioritária, compromissos futuros/em andamento e "
            "contagem de pendências que precisam de atenção."
        ),
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        kind="read",
        requires_confirmation=False,
        handler=_get_today_summary,
    ),
    "list_upcoming_appointments": ToolDefinition(
        name="list_upcoming_appointments",
        description="Lista compromissos agendados nos próximos dias (a partir de agora).",
        parameters={
            "type": "object",
            "properties": {
                "within_days": {"type": "integer", "minimum": 1, "maximum": 14},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_list_upcoming_appointments,
    ),
    "list_ending_cycles": ToolDefinition(
        name="list_ending_cycles",
        description="Lista ciclos ativos que terminam em breve.",
        parameters={
            "type": "object",
            "properties": {
                "within_days": {"type": "integer", "minimum": 1, "maximum": 30},
            },
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_list_ending_cycles,
    ),
    "list_cycles_needing_attention": ToolDefinition(
        name="list_cycles_needing_attention",
        description=(
            "Lista ciclos que precisam de atenção: próximos do fim ou encerrados sem renovação."
        ),
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        kind="read",
        requires_confirmation=False,
        handler=_list_cycles_needing_attention,
    ),
    "get_cycle_details": ToolDefinition(
        name="get_cycle_details",
        description="Detalha um ciclo específico (aulas, valores, datas, renovação).",
        parameters={
            "type": "object",
            "properties": {"cycle_id": {"type": "string", "format": "uuid"}},
            "required": ["cycle_id"],
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_get_cycle_details,
    ),
    # --- Read: financeiro ------------------------------------------------
    "list_pending_receivables": ToolDefinition(
        name="list_pending_receivables",
        description="Lista recebimentos pendentes.",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        kind="read",
        requires_confirmation=False,
        handler=_list_pending_receivables,
    ),
    "get_payment_status": ToolDefinition(
        name="get_payment_status",
        description="Consulta a situação de pagamentos de um cliente específico.",
        parameters={
            "type": "object",
            "properties": {"client_id": {"type": "string", "format": "uuid"}},
            "required": ["client_id"],
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_get_payment_status,
    ),
    "list_renewal_requests": ToolDefinition(
        name="list_renewal_requests",
        description="Lista pedidos de renovação enviados pelos clientes pelo portal.",
        parameters={
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": [
                        "requested",
                        "acknowledged",
                        "payment_reported",
                        "resolved",
                        "dismissed",
                    ],
                },
            },
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_list_renewal_requests,
    ),
    # --- Read: clientes ----------------------------------------------------
    "find_client": ToolDefinition(
        name="find_client",
        description="Busca cliente por nome. Em ambiguidade, retorna candidatos.",
        parameters={
            "type": "object",
            "properties": {
                "name_query": {"type": "string", "minLength": 2, "maxLength": 120},
            },
            "required": ["name_query"],
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_find_client,
    ),
    "search_clients": ToolDefinition(
        name="search_clients",
        description=(
            "Busca cliente por nome (alias de find_client). Em ambiguidade, retorna candidatos."
        ),
        parameters={
            "type": "object",
            "properties": {
                "name_query": {"type": "string", "minLength": 2, "maxLength": 120},
            },
            "required": ["name_query"],
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_find_client,
    ),
    "get_client_overview": ToolDefinition(
        name="get_client_overview",
        description=(
            "Visão geral de um cliente: ciclos ativos, pendências financeiras e avaliações."
        ),
        parameters={
            "type": "object",
            "properties": {"client_id": {"type": "string", "format": "uuid"}},
            "required": ["client_id"],
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_get_client_overview,
    ),
    # --- Read: avaliações ----------------------------------------------------
    "list_recent_published_evaluations": ToolDefinition(
        name="list_recent_published_evaluations",
        description="Lista avaliações publicadas recentemente.",
        parameters={
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_list_recent_evaluations,
    ),
    "list_client_evaluations": ToolDefinition(
        name="list_client_evaluations",
        description="Lista avaliações (rascunho e publicadas) de um cliente específico.",
        parameters={
            "type": "object",
            "properties": {"client_id": {"type": "string", "format": "uuid"}},
            "required": ["client_id"],
            "additionalProperties": False,
        },
        kind="read",
        requires_confirmation=False,
        handler=_list_client_evaluations,
    ),
    # --- Write: clientes -----------------------------------------------------
    "propose_create_client": ToolDefinition(
        name="propose_create_client",
        description="Propõe cadastrar um novo cliente. Exige confirmação do usuário.",
        parameters={
            "type": "object",
            "properties": {
                "full_name": {"type": "string", "minLength": 2, "maxLength": 200},
                "phone": {"type": "string", "maxLength": 32},
                "email": {"type": "string", "maxLength": 320},
                "notes": {"type": "string", "maxLength": 2000},
            },
            "required": ["full_name"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_create_client,
        risk_class="write_common",
    ),
    # --- Write: agenda -------------------------------------------------------
    "propose_create_appointment": ToolDefinition(
        name="propose_create_appointment",
        description="Propõe agendar um novo compromisso. Exige confirmação do usuário.",
        parameters={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "format": "uuid"},
                "starts_at": {"type": "string", "format": "date-time"},
                "ends_at": {"type": "string", "format": "date-time"},
                "service_id": {"type": "string", "format": "uuid"},
                "cycle_id": {"type": "string", "format": "uuid"},
                "location_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string", "maxLength": 200},
                "notes": {"type": "string", "maxLength": 2000},
            },
            "required": ["client_id", "starts_at", "ends_at"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_create_appointment,
        risk_class="write_common",
    ),
    "propose_reschedule_appointment": ToolDefinition(
        name="propose_reschedule_appointment",
        description="Propõe remarcar um compromisso existente. Exige confirmação do usuário.",
        parameters={
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "format": "uuid"},
                "starts_at": {"type": "string", "format": "date-time"},
                "ends_at": {"type": "string", "format": "date-time"},
            },
            "required": ["appointment_id", "starts_at", "ends_at"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_reschedule_appointment,
        risk_class="write_common",
    ),
    "propose_mark_appointment_outcome": ToolDefinition(
        name="propose_mark_appointment_outcome",
        description=(
            "Propõe marcar o desfecho de um compromisso (realizado ou falta). "
            "Exige confirmação do usuário."
        ),
        parameters={
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "format": "uuid"},
                "outcome": {"type": "string", "enum": ["completed", "no_show"]},
            },
            "required": ["appointment_id", "outcome"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_mark_appointment_outcome,
        risk_class="write_common",
    ),
    # --- Write: ciclos e pagamentos -------------------------------------------
    "propose_create_cycle": ToolDefinition(
        name="propose_create_cycle",
        description=(
            "Propõe criar um novo ciclo (pacote de serviço) para um cliente. Exige confirmação."
        ),
        parameters={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "format": "uuid"},
                "service_id": {"type": "string", "format": "uuid"},
                "starts_on": {"type": "string", "format": "date"},
                "ends_on": {"type": "string", "format": "date"},
                "value_cents": {"type": "integer", "minimum": 0, "maximum": 100000000},
                "notes": {"type": "string", "maxLength": 2000},
                "create_receivable": {"type": "boolean"},
                "receivable_due_on": {"type": "string", "format": "date"},
            },
            "required": ["client_id", "service_id", "starts_on", "ends_on"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_create_cycle,
        risk_class="write_common",
    ),
    "propose_record_payment": ToolDefinition(
        name="propose_record_payment",
        description="Propõe marcar um recebimento como pago. Exige confirmação do usuário.",
        parameters={
            "type": "object",
            "properties": {
                "receivable_id": {"type": "string", "format": "uuid"},
                "payment_method": {"type": "string", "maxLength": 50},
                "notes": {"type": "string", "maxLength": 2000},
            },
            "required": ["receivable_id"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_record_payment,
        risk_class="write_sensitive",
    ),
    # --- Write: avaliações -----------------------------------------------------
    "propose_create_evaluation_draft": ToolDefinition(
        name="propose_create_evaluation_draft",
        description=(
            "Propõe criar um rascunho de avaliação para um cliente. "
            "Exige confirmação explícita do usuário antes de executar."
        ),
        parameters={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string", "minLength": 2, "maxLength": 200},
                "summary": {"type": "string"},
                "client_message": {"type": "string"},
            },
            "required": ["client_id", "title"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_create_evaluation_draft,
        risk_class="write_common",
    ),
    "propose_add_milestone": ToolDefinition(
        name="propose_add_milestone",
        description=(
            "Propõe registrar um marco de evolução do cliente (salvo como rascunho de "
            "avaliação). Exige confirmação do usuário."
        ),
        parameters={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string", "minLength": 2, "maxLength": 200},
                "description": {"type": "string", "maxLength": 2000},
            },
            "required": ["client_id", "title"],
            "additionalProperties": False,
        },
        kind="write",
        requires_confirmation=True,
        handler=_propose_add_milestone,
        risk_class="write_common",
    ),
}


WRITE_EXECUTORS: dict[str, Callable[[ToolContext, dict[str, Any]], dict[str, Any]]] = {
    "create_client": execute_create_client,
    "create_appointment": execute_create_appointment,
    "reschedule_appointment": execute_reschedule_appointment,
    "mark_appointment_outcome": execute_mark_appointment_outcome,
    "create_cycle": execute_create_cycle,
    "record_payment": execute_record_payment,
    "create_evaluation_draft": execute_create_evaluation_draft,
    "add_milestone": execute_add_milestone,
}


def executor_name_for_tool(tool_name: str) -> str:
    """Normalize a `propose_*` tool name to its `execute_*` key."""
    return tool_name[len("propose_") :] if tool_name.startswith("propose_") else tool_name


def tool_specs() -> list[ToolSpec]:
    return [
        ToolSpec(name=t.name, description=t.description, parameters=t.parameters)
        for t in TOOLS.values()
    ]


def get_tool(name: str) -> ToolDefinition:
    tool = TOOLS.get(name)
    if tool is None:
        raise AuthError("tool_not_allowed", "Ferramenta não permitida.", 400)
    return tool
