"""Agent tool catalog — allowlisted only; tenant always from auth context."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
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


class ProposeCreateEvaluationDraftArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: uuid.UUID
    title: str = Field(min_length=2, max_length=200)
    summary: str | None = Field(default=None, max_length=5000)
    client_message: str | None = Field(default=None, max_length=5000)


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


def _propose_create_evaluation_draft(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Write tool — orchestrator intercepts and creates pending_action instead of executing."""
    parsed = ProposeCreateEvaluationDraftArgs.model_validate(args)
    # Validate client belongs to tenant before proposing
    domain_svc.get_client(
        ctx.db, organization_id=ctx.organization_id, client_id=parsed.client_id
    )
    return {
        "needs_confirmation": True,
        "tool_name": "create_evaluation_draft",
        "arguments": parsed.model_dump(mode="json"),
        "summary": (
            f"Criar rascunho de avaliação “{parsed.title}” "
            f"para o cliente {parsed.client_id}."
        ),
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
        "evaluation_id": str(row.id),
        "status": row.status,
        "title": row.title,
        "client_id": str(row.client_id),
    }


TOOLS: dict[str, ToolDefinition] = {
    "list_today_appointments": ToolDefinition(
        name="list_today_appointments",
        description="Lista os compromissos de hoje do profissional.",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        kind="read",
        requires_confirmation=False,
        handler=_list_today_appointments,
    ),
    "list_ending_cycles": ToolDefinition(
        name="list_ending_cycles",
        description="Lista ciclos que terminam em breve.",
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
    "list_pending_receivables": ToolDefinition(
        name="list_pending_receivables",
        description="Lista recebimentos pendentes.",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        kind="read",
        requires_confirmation=False,
        handler=_list_pending_receivables,
    ),
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
    ),
}


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
