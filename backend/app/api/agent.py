from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent import confirmation as conf_svc
from app.agent.orchestrator import agent_status, rate_limit_info, run_turn
from app.agent.thread_entities import make_entity_ref
from app.billing.entitlement import SubscriptionEntitlementService
from app.config import get_settings
from app.db import check_database, get_db
from app.models.agent import AgentPendingAction
from app.schemas.agent import (
    AgentChatIn,
    AgentChatOut,
    AgentConfirmIn,
    AgentHealthOut,
    AgentMessageOut,
    AgentStatusOut,
    PendingActionListOut,
    PendingActionOut,
    ThreadCreateIn,
    ThreadDetailOut,
    ThreadListOut,
    ThreadOut,
    VoiceLimitsOut,
    VoiceTranscribeOut,
)
from app.services import agent_threads as threads_svc
from app.services import voice_transcription as voice_svc
from app.services.auth import AuthContext, AuthError, get_current_auth

router = APIRouter(prefix="/agent", tags=["agent"])


def _http(exc: AuthError) -> HTTPException:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.details is not None:
        detail["details"] = exc.details
    return HTTPException(status_code=exc.status_code, detail=detail)


def _pending_action_out(row: AgentPendingAction) -> PendingActionOut:
    return PendingActionOut(
        id=row.id,
        thread_id=row.thread_id,
        tool_name=row.tool_name,
        risk_class=row.risk_class,
        summary=row.summary_text,
        summary_fields=row.summary_fields,
        arguments=row.arguments,
        expires_at=row.expires_at.isoformat(),
        status=row.status,
        result=row.result_safe,
        error_code=row.error_sanitized,
    )


def _chat_out_from_result(result) -> AgentChatOut:
    pending = None
    if result.pending_action:
        pending = PendingActionOut(
            id=UUID(result.pending_action["id"]),
            thread_id=UUID(result.pending_action["thread_id"])
            if result.pending_action.get("thread_id")
            else None,
            tool_name=result.pending_action["tool_name"],
            risk_class=result.pending_action.get("risk_class", "write_common"),
            summary=result.pending_action["summary"],
            summary_fields=result.pending_action.get("summary_fields"),
            arguments=result.pending_action["arguments"],
            expires_at=result.pending_action["expires_at"],
            status=result.pending_action.get("status") or "pending",
        )
    return AgentChatOut(
        reply=result.reply,
        status=result.status,
        thread_id=UUID(result.thread_id) if result.thread_id else None,
        pending_action=pending,
        tool_trace=result.tool_trace,
        usage=result.usage,
        idempotent_replay=bool(getattr(result, "idempotent_replay", False)),
    )


@router.get("/status", response_model=AgentStatusOut)
def get_agent_status(
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AgentStatusOut:
    settings = get_settings()
    base = agent_status(settings)
    entitlement_ok = True
    if settings.ai_enabled:
        snap = SubscriptionEntitlementService(db).get_for_organization(auth.organization.id)
        entitlement_ok = bool(snap.has_active_access)
    voice_meta = voice_svc.voice_status(settings)
    voice_limits = VoiceLimitsOut(
        max_seconds=voice_meta["max_seconds"],
        max_bytes=voice_meta["max_bytes"],
        user_requests_per_minute=settings.voice_user_requests_per_minute,
        org_daily_request_limit=settings.voice_org_daily_request_limit,
        allowed_mime_types=voice_meta["allowed_mime_types"],
    )
    return AgentStatusOut(
        **base,
        entitlement_ok=entitlement_ok,
        limits=rate_limit_info(settings),
        voice_enabled=bool(settings.voice_enabled and settings.ai_enabled),
        voice=voice_limits,
    )


@router.post("/transcribe", response_model=VoiceTranscribeOut)
async def transcribe_voice(
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    duration_seconds: float | None = Form(default=None),
) -> VoiceTranscribeOut:
    settings = get_settings()
    raw = await file.read()
    # Cap read defensively even if client lies about size
    if len(raw) > settings.voice_max_bytes + 1024:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "voice_too_large",
                "message": "O áudio ultrapassou o tamanho máximo permitido. Grave um trecho mais curto.",
            },
        )
    try:
        result = voice_svc.transcribe_audio(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            audio_bytes=raw,
            content_type=file.content_type,
            duration_hint_seconds=duration_seconds,
            request_id=request.headers.get("x-request-id"),
            settings=settings,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return VoiceTranscribeOut(
        text=result.text,
        model=result.model,
        duration_seconds=result.duration_seconds,
        latency_ms=result.latency_ms,
        bytes_received=result.bytes_received,
        mime_type=result.mime_type,
        request_id=result.request_id,
    )


@router.get("/health", response_model=AgentHealthOut)
def get_agent_health() -> AgentHealthOut:
    settings = get_settings()
    db_ok = False
    try:
        db_ok = check_database()
    except Exception:
        db_ok = False
    return AgentHealthOut(
        status="ok" if db_ok else "degraded",
        ai_enabled=bool(settings.ai_enabled),
        provider=settings.llm_provider,
        database=db_ok,
    )


@router.post("/chat", response_model=AgentChatOut)
def agent_chat(
    payload: AgentChatIn,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AgentChatOut:
    """Convenience endpoint — reuses the latest active thread, or lets run_turn start one."""
    request_id = request.headers.get("x-request-id")
    existing_thread = threads_svc.get_latest_active_thread(
        db, organization_id=auth.organization.id, user_id=auth.user.id
    )
    try:
        result = run_turn(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            message=payload.message,
            thread_id=existing_thread.id if existing_thread else None,
            request_id=request_id,
            client_message_id=payload.client_message_id,
            input_modality=payload.input_modality,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _chat_out_from_result(result)


@router.post("/threads", response_model=ThreadOut, status_code=201)
def create_thread(
    payload: ThreadCreateIn,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ThreadOut:
    row = threads_svc.create_thread(
        db,
        organization_id=auth.organization.id,
        user_id=auth.user.id,
        title=payload.title,
    )
    return ThreadOut.model_validate(row)


@router.get("/threads", response_model=ThreadListOut)
def list_threads(
    status: str | None = Query(default="active", pattern="^(active|archived)$"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ThreadListOut:
    rows = threads_svc.list_threads(
        db, organization_id=auth.organization.id, user_id=auth.user.id, status=status
    )
    return ThreadListOut(items=[ThreadOut.model_validate(r) for r in rows])


@router.get("/threads/{thread_id}", response_model=ThreadDetailOut)
def get_thread_detail(
    thread_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ThreadDetailOut:
    try:
        thread = threads_svc.get_thread(
            db, organization_id=auth.organization.id, user_id=auth.user.id, thread_id=thread_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    messages = threads_svc.list_recent_messages(db, thread_id=thread.id, limit=100)
    return ThreadDetailOut(
        thread=ThreadOut.model_validate(thread),
        messages=[AgentMessageOut.model_validate(m) for m in messages],
    )


@router.post("/threads/{thread_id}/archive", response_model=ThreadOut)
def archive_thread(
    thread_id: UUID,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> ThreadOut:
    try:
        row = threads_svc.archive_thread(
            db, organization_id=auth.organization.id, user_id=auth.user.id, thread_id=thread_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return ThreadOut.model_validate(row)


@router.post("/threads/{thread_id}/messages", response_model=AgentChatOut)
def post_thread_message(
    thread_id: UUID,
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
            thread_id=thread_id,
            request_id=request_id,
            client_message_id=payload.client_message_id,
            input_modality=payload.input_modality,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return _chat_out_from_result(result)


@router.get("/threads/{thread_id}/pending-actions", response_model=PendingActionListOut)
def list_thread_pending_actions(
    thread_id: UUID,
    status: str | None = Query(default="pending"),
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> PendingActionListOut:
    try:
        threads_svc.get_thread(
            db, organization_id=auth.organization.id, user_id=auth.user.id, thread_id=thread_id
        )
    except AuthError as exc:
        raise _http(exc) from exc
    query = select(AgentPendingAction).where(
        AgentPendingAction.thread_id == thread_id,
        AgentPendingAction.organization_id == auth.organization.id,
        AgentPendingAction.user_id == auth.user.id,
    )
    if status:
        query = query.where(AgentPendingAction.status == status)
    rows = list(db.scalars(query.order_by(AgentPendingAction.created_at.desc())).all())
    return PendingActionListOut(items=[_pending_action_out(r) for r in rows])


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
            request_id=request.headers.get("x-request-id")
            or payload.confirmation_key,
        )
    except AuthError as exc:
        raise _http(exc) from exc
    result = data["result"]
    tool_row = db.get(AgentPendingAction, pending_id)
    executor_key = tool_row.tool_name if tool_row else ""
    reply = conf_svc.confirm_reply_text(executor_key, result)
    if data.get("idempotent_replay"):
        reply = f"{reply} (já estava concluída — sem nova alteração.)"
    thread_id = data.get("thread_id")
    pending_out = _pending_action_out(tool_row) if tool_row else None

    if thread_id and isinstance(result, dict) and result.get("id") and not data.get(
        "idempotent_replay"
    ):
        thread = threads_svc.get_thread(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            thread_id=thread_id,
        )
        entities = []
        if executor_key == "create_client":
            entities.append(
                make_entity_ref(
                    entity_type="client",
                    entity_id=result["id"],
                    display_name=str(result.get("full_name") or "cliente"),
                    operation="create",
                )
            )
        elif executor_key == "create_cycle":
            entities.append(
                make_entity_ref(
                    entity_type="cycle",
                    entity_id=result["id"],
                    display_name="ciclo",
                    operation="create",
                )
            )
            if tool_row and isinstance(tool_row.arguments, dict):
                cid = tool_row.arguments.get("client_id")
                fields = tool_row.summary_fields or {}
                if cid:
                    entities.append(
                        make_entity_ref(
                            entity_type="client",
                            entity_id=cid,
                            display_name=str(fields.get("Cliente") or "cliente"),
                            operation="create_cycle",
                        )
                    )
        if entities:
            threads_svc.append_message(
                db,
                thread=thread,
                role="assistant",
                content=reply,
                message_type="text",
                metadata_safe={"entities": entities, "confirmed_pending_id": str(pending_id)},
            )

    return AgentChatOut(
        reply=reply,
        status="executed",
        thread_id=thread_id,
        usage={},
        tool_trace=[data.get("pending_action_id", "")],
        action_status=data.get("action_status") or "executed",
        result=result if isinstance(result, dict) else None,
        pending_action=pending_out,
        idempotent_replay=bool(data.get("idempotent_replay")),
    )


@router.post("/pending/{pending_id}/cancel", response_model=AgentChatOut)
def cancel_pending(
    pending_id: UUID,
    request: Request,
    auth: AuthContext = Depends(get_current_auth),
    db: Session = Depends(get_db),
) -> AgentChatOut:
    try:
        row = conf_svc.cancel_pending_action(
            db,
            organization_id=auth.organization.id,
            user_id=auth.user.id,
            pending_id=pending_id,
            request_id=request.headers.get("x-request-id"),
        )
    except AuthError as exc:
        raise _http(exc) from exc
    return AgentChatOut(
        reply="Ação cancelada.",
        status="cancelled",
        action_status="cancelled",
        pending_action=_pending_action_out(row),
        thread_id=row.thread_id,
    )
