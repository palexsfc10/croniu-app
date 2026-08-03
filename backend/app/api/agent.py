from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.agent import confirmation as conf_svc
from app.agent.orchestrator import agent_status, run_turn
from app.db import get_db
from app.schemas.agent import (
    AgentChatIn,
    AgentChatOut,
    AgentConfirmIn,
    AgentStatusOut,
    PendingActionOut,
)
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/agent", tags=["agent"])


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/status", response_model=AgentStatusOut)
def get_agent_status(
    auth: AuthContext = Depends(get_current_auth),
) -> AgentStatusOut:
    _ = auth
    return AgentStatusOut(**agent_status())


@router.post("/chat", response_model=AgentChatOut)
def agent_chat(
    payload: AgentChatIn,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AgentChatOut:
    request_id = request.headers.get("x-request-id")
    try:
        result = run_turn(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            message=payload.message,
            request_id=request_id,
        )
    except AuthError as exc:
        raise _http(exc) from exc

    pending = None
    if result.pending_action:
        pending = PendingActionOut(
            id=UUID(result.pending_action["id"]),
            tool_name=result.pending_action["tool_name"],
            summary=result.pending_action["summary"],
            arguments=result.pending_action["arguments"],
            expires_at=result.pending_action["expires_at"],
        )
    return AgentChatOut(
        reply=result.reply,
        status=result.status,
        pending_action=pending,
        tool_trace=result.tool_trace,
        usage=result.usage,
    )


@router.post("/pending/{pending_id}/confirm", response_model=AgentChatOut)
def confirm_pending(
    pending_id: UUID,
    payload: AgentConfirmIn,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AgentChatOut:
    try:
        data = conf_svc.confirm_pending_action(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            pending_id=pending_id,
            expected_arguments=payload.arguments,
            request_id=request.headers.get("x-request-id"),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    result = data["result"]
    return AgentChatOut(
        reply=f"Pronto. Rascunho de avaliação criado ({result.get('title')}).",
        status="executed",
        usage={},
        tool_trace=[data.get("pending_action_id", "")],
    )


@router.post("/pending/{pending_id}/cancel", response_model=AgentChatOut)
def cancel_pending(
    pending_id: UUID,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AgentChatOut:
    try:
        conf_svc.cancel_pending_action(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            pending_id=pending_id,
            request_id=request.headers.get("x-request-id"),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return AgentChatOut(reply="Ação cancelada.", status="cancelled")
