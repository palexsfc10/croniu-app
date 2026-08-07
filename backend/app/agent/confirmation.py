"""Pending action confirmation protocol for write tools."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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

logger = logging.getLogger("croniu.agent.confirmation")

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

_TERMINAL_STATUSES = frozenset({"executed", "cancelled", "expired", "failed"})


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
        db,
        organization_id=organization_id,
        user_id=user_id,
        pending_id=pending_id,
        for_update=True,
    )
    if row.status == "cancelled":
        return row
    if row.status != "pending":
        raise AuthError(
            "invalid_status",
            _status_message(row.status),
            409,
            details={"action_status": row.status, "pending_action_id": str(row.id)},
        )
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
) -> dict[str, Any]:
    """Confirm with compare-and-set. Idempotent for executed; safe on failure."""
    row = _get_owned_pending(
        db,
        organization_id=organization_id,
        user_id=user_id,
        pending_id=pending_id,
        for_update=True,
    )
    now = datetime.now(UTC)

    # Idempotent success replay
    if row.status == "executed":
        result = dict(row.result_safe or {})
        if row.result_entity_id and "id" not in result:
            result["id"] = row.result_entity_id
        return {
            "pending_action_id": str(row.id),
            "thread_id": row.thread_id,
            "result": result,
            "action_status": "executed",
            "idempotent_replay": True,
        }

    if row.status == "executing":
        # Another request owns the lock; after commit of that txn we may still see executing
        # only briefly. Treat as in-progress for the client.
        raise AuthError(
            "in_progress",
            "Esta ação já está sendo executada. Aguarde um instante.",
            409,
            details={"action_status": "executing", "pending_action_id": str(row.id)},
        )

    if row.status == "cancelled":
        raise AuthError(
            "cancelled",
            "Esta ação foi cancelada. Peça uma nova proposta se ainda precisar.",
            409,
            details={"action_status": "cancelled", "pending_action_id": str(row.id)},
        )

    if row.status == "failed":
        raise AuthError(
            row.error_sanitized or "failed",
            _failed_message(row.error_sanitized),
            409,
            details={"action_status": "failed", "pending_action_id": str(row.id)},
        )

    if row.status == "expired":
        raise AuthError(
            "expired",
            "A confirmação expirou. Solicite novamente.",
            410,
            details={"action_status": "expired", "pending_action_id": str(row.id)},
        )

    if row.status != "pending":
        # Legacy stuck "confirmed" (pre-fix) → mark failed and surface clearly
        if row.status == "confirmed":
            row.status = "failed"
            row.error_sanitized = row.error_sanitized or "interrupted"
            db.add(row)
            db.commit()
            raise AuthError(
                "failed",
                "A confirmação anterior não concluiu. Peça uma nova proposta.",
                409,
                details={"action_status": "failed", "pending_action_id": str(row.id)},
            )
        raise AuthError(
            "invalid_status",
            _status_message(row.status),
            409,
            details={"action_status": row.status, "pending_action_id": str(row.id)},
        )

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
        raise AuthError(
            "expired",
            "A confirmação expirou. Solicite novamente.",
            410,
            details={"action_status": "expired", "pending_action_id": str(row.id)},
        )

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
            details={"action_status": "pending", "pending_action_id": str(row.id)},
        )

    executor = WRITE_EXECUTORS.get(row.tool_name)
    if executor is None:
        raise AuthError("tool_not_allowed", "Ferramenta não permitida.", 400)

    # CAS: pending -> executing (only one concurrent winner)
    row.status = "executing"
    row.confirmed_at = now
    db.add(row)
    db.commit()
    db.refresh(row)

    ctx = ToolContext(
        organization_id=organization_id,
        user_id=user_id,
        db=db,
        request_id=request_id,
    )
    try:
        result = executor(ctx, dict(row.arguments))
    except AuthError as exc:
        _mark_failed(db, row=row, error_code=exc.code, request_id=request_id)
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
        raise AuthError(
            exc.code,
            exc.message,
            exc.status_code,
            details={"action_status": "failed", "pending_action_id": str(row.id)},
        ) from exc
    except IntegrityError as exc:
        db.rollback()
        # row detached after rollback — reload
        row = _get_owned_pending(
            db,
            organization_id=organization_id,
            user_id=user_id,
            pending_id=pending_id,
            for_update=True,
        )
        code = _integrity_error_code(exc)
        _mark_failed(db, row=row, error_code=code, request_id=request_id)
        write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="pending_action_failed",
            status="error",
            tool_name=row.tool_name,
            confirmation_required=True,
            entity_id=str(row.id),
            error_sanitized=code,
            request_id=request_id,
        )
        raise AuthError(
            code,
            _failed_message(code),
            409,
            details={"action_status": "failed", "pending_action_id": str(row.id)},
        ) from exc
    except Exception:
        db.rollback()
        row = _get_owned_pending(
            db,
            organization_id=organization_id,
            user_id=user_id,
            pending_id=pending_id,
            for_update=True,
        )
        logger.exception("pending_action_unexpected_error id=%s", pending_id)
        _mark_failed(db, row=row, error_code="execution_error", request_id=request_id)
        write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="pending_action_failed",
            status="error",
            tool_name=row.tool_name,
            confirmation_required=True,
            entity_id=str(row.id),
            error_sanitized="execution_error",
            request_id=request_id,
        )
        raise AuthError(
            "execution_error",
            "Não foi possível concluir a ação. Tente novamente com uma nova proposta.",
            500,
            details={"action_status": "failed", "pending_action_id": str(row.id)},
        )

    safe_result = _sanitize_result(result if isinstance(result, dict) else {})
    row.status = "executed"
    row.executed_at = datetime.now(UTC)
    entity_id = safe_result.get("id") or safe_result.get("evaluation_id")
    row.result_entity_id = str(entity_id) if entity_id else None
    row.result_safe = safe_result
    row.error_sanitized = None
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
        metadata_safe={"pending_id": str(row.id), "idempotent_replay": False},
    )
    return {
        "pending_action_id": str(row.id),
        "thread_id": row.thread_id,
        "result": safe_result,
        "action_status": "executed",
        "idempotent_replay": False,
    }


def _mark_failed(
    db: Session,
    *,
    row: AgentPendingAction,
    error_code: str,
    request_id: str | None,
) -> None:
    row.status = "failed"
    row.error_sanitized = error_code
    if request_id:
        row.request_id = request_id
    db.add(row)
    db.commit()


def _sanitize_result(result: dict[str, Any]) -> dict[str, Any]:
    blocked = {"password", "token", "api_key", "secret", "authorization"}
    out: dict[str, Any] = {}
    for key, value in result.items():
        if any(b in key.lower() for b in blocked):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            out[key] = value
        else:
            out[key] = str(value)[:200]
    return out


def _integrity_error_code(exc: IntegrityError) -> str:
    msg = str(getattr(exc, "orig", exc)).lower()
    if "uq_clients_org_email" in msg or "clients_org_email" in msg:
        return "client_email_exists"
    if "uq_clients" in msg and "email" in msg:
        return "client_email_exists"
    return "conflict"


def _failed_message(code: str | None) -> str:
    if code == "client_email_exists":
        return "Já existe um cliente com este e-mail nesta organização. Ajuste o e-mail ou use o cadastro existente."
    if code == "arguments_mismatch":
        return "Os argumentos não coincidem com a ação apresentada."
    if code == "interrupted":
        return "A confirmação anterior não concluiu. Peça uma nova proposta."
    return "A ação falhou. Peça uma nova proposta se ainda precisar."


def _status_message(status: str) -> str:
    if status == "executed":
        return "Esta ação já foi concluída."
    if status == "cancelled":
        return "Esta ação foi cancelada. Peça uma nova proposta se ainda precisar."
    if status == "expired":
        return "A confirmação expirou. Solicite novamente."
    if status == "failed":
        return "Esta ação falhou. Peça uma nova proposta se ainda precisar."
    if status == "executing":
        return "Esta ação já está sendo executada. Aguarde um instante."
    return "Esta ação não está mais pendente."


def _get_owned_pending(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    pending_id: uuid.UUID,
    for_update: bool = False,
) -> AgentPendingAction:
    query = select(AgentPendingAction).where(
        AgentPendingAction.id == pending_id,
        AgentPendingAction.organization_id == organization_id,
        AgentPendingAction.user_id == user_id,
    )
    if for_update:
        query = query.with_for_update()
    row = db.scalar(query)
    if row is None:
        raise AuthError("not_found", "Ação pendente não encontrada.", 404)
    return row
