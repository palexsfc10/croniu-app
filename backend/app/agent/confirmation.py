"""Pending action confirmation protocol for write tools."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.tools import (
    ToolContext,
    execute_create_evaluation_draft,
    get_tool,
)
from app.config import get_settings
from app.models.agent import AgentAuditLog, AgentPendingAction
from app.services.auth import AuthError

WRITE_EXECUTORS = {
    "create_evaluation_draft": execute_create_evaluation_draft,
    "propose_create_evaluation_draft": execute_create_evaluation_draft,
}


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


def create_pending_action(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    tool_name: str,
    arguments: dict,
    summary_text: str,
    request_id: str | None = None,
) -> AgentPendingAction:
    settings = get_settings()
    # Normalize write tool name to executor key
    executor_name = (
        "create_evaluation_draft"
        if tool_name.startswith("propose_")
        else tool_name
    )
    if executor_name not in WRITE_EXECUTORS:
        raise AuthError("tool_not_allowed", "Ferramenta de escrita não suportada.", 400)
    get_tool("propose_create_evaluation_draft")  # allowlist check for current write set

    row = AgentPendingAction(
        organization_id=organization_id,
        user_id=user_id,
        tool_name=executor_name,
        arguments=arguments,
        summary_text=summary_text,
        status="pending",
        expires_at=datetime.now(UTC)
        + timedelta(minutes=settings.ai_pending_action_ttl_minutes),
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
    entity_id = result.get("evaluation_id") or result.get("id")
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
    return {"pending_action_id": str(row.id), "result": result}


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
