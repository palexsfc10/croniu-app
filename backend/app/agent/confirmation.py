"""Pending action confirmation protocol for write tools."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.tools import (
    WRITE_EXECUTORS,
    ToolContext,
    executor_name_for_tool,
    get_tool,
)
from app.config import get_settings
from app.models.agent import AgentAuditLog, AgentPendingAction
from app.services.auth import AuthError

_CONFIRM_REPLY_TEMPLATES: dict[str, str] = {
    "create_client": "Pronto. Cliente “{full_name}” cadastrado.",
    "create_appointment": "Pronto. Compromisso agendado.",
    "reschedule_appointment": "Pronto. Compromisso remarcado.",
    "mark_appointment_outcome": "Pronto. Compromisso atualizado.",
    "create_cycle": "Pronto. Ciclo criado.",
    "record_payment": "Pronto. Recebimento marcado como pago.",
    "create_evaluation_draft": "Pronto. Rascunho de avaliação criado ({title}).",
    "add_milestone": "Pronto. Marco registrado ({title}).",
}


def confirm_reply_text(executor_name: str, result: dict) -> str:
    template = _CONFIRM_REPLY_TEMPLATES.get(executor_name, "Ação executada com sucesso.")
    try:
        return template.format(**result)
    except (KeyError, IndexError):
        return "Ação executada com sucesso."


def write_audit(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    operation: str,
    status: str,
    tool_name: str | None = None,
    confirmation_required: bool = False,
    entity_id: str | None = None,
    error_sanitized: str | None = None,
    request_id: str | None = None,
    metadata_safe: dict | None = None,
) -> None:
    db.add(
        AgentAuditLog(
            organization_id=organization_id,
            user_id=user_id,
            tool_name=tool_name,
            operation=operation,
            status=status,
            confirmation_required=confirmation_required,
            entity_id=entity_id,
            error_sanitized=error_sanitized,
            request_id=request_id,
            metadata_safe=metadata_safe,
        )
    )
    db.commit()


def _compute_idempotency_key(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    executor_name: str,
    arguments: dict,
    thread_id: uuid.UUID | None,
) -> str:
    payload = json.dumps(
        {
            "org": str(organization_id),
            "user": str(user_id),
            "tool": executor_name,
            "thread": str(thread_id) if thread_id else None,
            "args": arguments,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def create_pending_action(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    tool_name: str,
    arguments: dict,
    summary_text: str,
    thread_id: uuid.UUID | None = None,
    risk_class: str = "write_common",
    summary_fields: dict | None = None,
    request_id: str | None = None,
) -> AgentPendingAction:
    settings = get_settings()
    executor_name = executor_name_for_tool(tool_name)
    if executor_name not in WRITE_EXECUTORS:
        raise AuthError("tool_not_allowed", "Ferramenta de escrita não suportada.", 400)
    propose_tool_name = (
        tool_name if tool_name.startswith("propose_") else f"propose_{executor_name}"
    )
    get_tool(propose_tool_name)  # allowlist check

    idempotency_key = _compute_idempotency_key(
        organization_id=organization_id,
        user_id=user_id,
        executor_name=executor_name,
        arguments=arguments,
        thread_id=thread_id,
    )
    existing = db.scalar(
        select(AgentPendingAction).where(
            AgentPendingAction.organization_id == organization_id,
            AgentPendingAction.idempotency_key == idempotency_key,
            AgentPendingAction.status == "pending",
        )
    )
    now = datetime.now(UTC)
    if existing is not None:
        expires_at = existing.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at > now:
            return existing

    row = AgentPendingAction(
        organization_id=organization_id,
        user_id=user_id,
        thread_id=thread_id,
        tool_name=executor_name,
        risk_class=risk_class,
        arguments=arguments,
        summary_text=summary_text,
        summary_fields=summary_fields,
        idempotency_key=idempotency_key,
        status="pending",
        expires_at=now + timedelta(seconds=settings.ai_confirmation_ttl_seconds),
        request_id=request_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    write_audit(
        db,
        organization_id=organization_id,
        user_id=user_id,
        operation="pending_action_created",
        status="ok",
        tool_name=executor_name,
        confirmation_required=True,
        entity_id=str(row.id),
        request_id=request_id,
        metadata_safe={"summary_len": len(summary_text)},
    )
    return row


def cancel_pending_action(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    pending_id: uuid.UUID,
    request_id: str | None = None,
) -> AgentPendingAction:
    row = _get_owned_pending(
        db, organization_id=organization_id, user_id=user_id, pending_id=pending_id
    )
    if row.status != "pending":
        raise AuthError("invalid_status", "Esta ação não está mais pendente.", 409)
    row.status = "cancelled"
    db.add(row)
    db.commit()
    db.refresh(row)
    write_audit(
        db,
        organization_id=organization_id,
        user_id=user_id,
        operation="pending_action_cancelled",
        status="ok",
        tool_name=row.tool_name,
        confirmation_required=True,
        entity_id=str(row.id),
        request_id=request_id,
    )
    return row


def confirm_pending_action(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    pending_id: uuid.UUID,
    expected_arguments: dict | None = None,
    request_id: str | None = None,
) -> dict:
    row = _get_owned_pending(
        db, organization_id=organization_id, user_id=user_id, pending_id=pending_id
    )
    now = datetime.now(UTC)
    if row.status == "executed":
        raise AuthError("already_executed", "Esta ação já foi executada.", 409)
    if row.status != "pending":
        raise AuthError("invalid_status", "Esta ação não está mais pendente.", 409)
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < now:
        row.status = "expired"
        db.add(row)
        db.commit()
        write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="pending_action_expired",
            status="error",
            tool_name=row.tool_name,
            confirmation_required=True,
            entity_id=str(row.id),
            request_id=request_id,
        )
        raise AuthError("expired", "A confirmação expirou. Solicite novamente.", 410)

    if expected_arguments is not None and expected_arguments != row.arguments:
        write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="pending_action_args_mismatch",
            status="error",
            tool_name=row.tool_name,
            confirmation_required=True,
            entity_id=str(row.id),
            request_id=request_id,
            error_sanitized="arguments_mismatch",
        )
        raise AuthError(
            "arguments_mismatch",
            "Os argumentos não coincidem com a ação apresentada.",
            409,
        )

    executor = WRITE_EXECUTORS.get(row.tool_name)
    if executor is None:
        raise AuthError("tool_not_allowed", "Ferramenta não permitida.", 400)

    # Mark confirmed before execute to reduce double-run race
    row.status = "confirmed"
    db.add(row)
    db.commit()

    ctx = ToolContext(
        organization_id=organization_id,
        user_id=user_id,
        db=db,
        request_id=request_id,
    )
    try:
        result = executor(ctx, dict(row.arguments))
    except AuthError as exc:
        row.status = "failed"
        row.error_sanitized = exc.code
        db.add(row)
        db.commit()
        write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="pending_action_failed",
            status="error",
            tool_name=row.tool_name,
            confirmation_required=True,
            entity_id=str(row.id),
            error_sanitized=exc.code,
            request_id=request_id,
        )
        raise

    row.status = "executed"
    row.executed_at = datetime.now(UTC)
    entity_id = result.get("id") or result.get("evaluation_id")
    row.result_entity_id = str(entity_id) if entity_id else None
    db.add(row)
    db.commit()
    write_audit(
        db,
        organization_id=organization_id,
        user_id=user_id,
        operation="pending_action_executed",
        status="ok",
        tool_name=row.tool_name,
        confirmation_required=True,
        entity_id=row.result_entity_id,
        request_id=request_id,
        metadata_safe={"pending_id": str(row.id)},
    )
    return {"pending_action_id": str(row.id), "thread_id": row.thread_id, "result": result}


def _get_owned_pending(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    pending_id: uuid.UUID,
) -> AgentPendingAction:
    row = db.scalar(
        select(AgentPendingAction).where(
            AgentPendingAction.id == pending_id,
            AgentPendingAction.organization_id == organization_id,
            AgentPendingAction.user_id == user_id,
        )
    )
    if row is None:
        raise AuthError("not_found", "Ação pendente não encontrada.", 404)
    return row
