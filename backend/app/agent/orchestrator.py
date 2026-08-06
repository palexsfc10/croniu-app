"""Agent orchestrator — LLM ↔ tools ↔ confirmation ↔ persistence."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from sqlalchemy.orm import Session

from app.agent import confirmation as conf_svc
from app.agent.prompts import SYSTEM_PROMPT_VERSION, get_system_prompt
from app.agent.providers import build_provider
from app.agent.providers.base import (
    LLMMessage,
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
)
from app.agent.tools import TOOLS, ToolContext, get_tool, tool_specs
from app.billing.entitlement import SubscriptionEntitlementService
from app.config import Settings, get_settings
from app.models.agent import AgentRun, AgentToolCall, AgentUsageDaily
from app.services import agent_threads as threads_svc
from app.services.auth import AuthError

logger = logging.getLogger("croniu.agent")

_hourly_lock = Lock()
_hourly_buckets: dict[str, list[float]] = defaultdict(list)
_minute_lock = Lock()
_minute_buckets: dict[str, list[float]] = defaultdict(list)

HISTORY_LIMIT = 20


@dataclass
class AgentMetrics:
    requests: int = 0
    errors: int = 0
    tool_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms_total: int = 0


_metrics = AgentMetrics()
_metrics_lock = Lock()


@dataclass
class AgentTurnResult:
    reply: str
    pending_action: dict[str, Any] | None = None
    tool_trace: list[str] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)
    status: str = "ok"
    thread_id: str | None = None


def agent_status(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    return {
        "enabled": bool(settings.ai_enabled),
        "provider": settings.llm_provider,
        "model": settings.resolved_llm_model,
        "prompt_version": SYSTEM_PROMPT_VERSION,
        "max_tool_steps": settings.llm_max_tool_steps,
        "tools": sorted(TOOLS.keys()),
    }


def rate_limit_info(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    return {
        "user_requests_per_minute": settings.ai_user_requests_per_minute,
        "org_daily_request_limit": settings.ai_org_daily_request_limit,
        "confirmation_ttl_seconds": settings.ai_confirmation_ttl_seconds,
    }


def _check_hourly_rate_limit(settings: Settings, *, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    key = f"{org_id}:{user_id}"
    now = time.time()
    window = 3600.0
    with _hourly_lock:
        bucket = [t for t in _hourly_buckets[key] if now - t < window]
        if len(bucket) >= settings.ai_rate_limit_per_hour:
            _hourly_buckets[key] = bucket
            raise AuthError(
                "ai_rate_limited",
                "Limite de uso do assistente atingido. Tente mais tarde.",
                429,
            )
        bucket.append(now)
        _hourly_buckets[key] = bucket


def _check_minute_rate_limit(settings: Settings, *, user_id: uuid.UUID) -> None:
    key = str(user_id)
    now = time.time()
    window = 60.0
    with _minute_lock:
        bucket = [t for t in _minute_buckets[key] if now - t < window]
        if len(bucket) >= settings.ai_user_requests_per_minute:
            _minute_buckets[key] = bucket
            raise AuthError(
                "ai_rate_limited",
                "Você está enviando mensagens rápido demais. Aguarde um instante.",
                429,
            )
        bucket.append(now)
        _minute_buckets[key] = bucket


def _get_or_create_usage_row(
    db: Session, *, organization_id: uuid.UUID, day: datetime
) -> AgentUsageDaily:
    today = day.date()
    row = db.get(AgentUsageDaily, (organization_id, today))
    if row is None:
        row = AgentUsageDaily(organization_id=organization_id, day=today)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _check_org_daily_limit(db: Session, settings: Settings, *, organization_id: uuid.UUID) -> None:
    row = _get_or_create_usage_row(db, organization_id=organization_id, day=datetime.now(UTC))
    if row.requests >= settings.ai_org_daily_request_limit:
        raise AuthError(
            "ai_org_daily_limit",
            "O limite diário de uso do assistente para esta organização foi atingido.",
            429,
        )


def _increment_usage_daily(
    db: Session,
    *,
    organization_id: uuid.UUID,
    requests: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_cents: int = 0,
    errors: int = 0,
) -> None:
    row = _get_or_create_usage_row(db, organization_id=organization_id, day=datetime.now(UTC))
    row.requests += requests
    row.input_tokens += input_tokens
    row.output_tokens += output_tokens
    row.estimated_cost_cents += cost_cents
    row.errors += errors
    db.add(row)
    db.commit()


def _usage_cost_cents(settings: Settings, *, input_tokens: int, output_tokens: int) -> int:
    cost = (input_tokens / 1000.0) * settings.llm_input_token_cost_per_1k + (
        output_tokens / 1000.0
    ) * settings.llm_output_token_cost_per_1k
    return round(cost * 100)


def _log_tool_call(
    db: Session,
    *,
    run_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    tool_name: str,
    risk_class: str,
    arguments_safe: dict | None,
    result_safe: dict | None,
    status: str,
    latency_ms: int,
) -> None:
    db.add(
        AgentToolCall(
            run_id=run_id,
            organization_id=organization_id,
            user_id=user_id,
            tool_name=tool_name,
            risk_class=risk_class,
            arguments_safe=arguments_safe,
            result_safe=result_safe,
            status=status,
            latency_ms=latency_ms,
        )
    )
    db.commit()


def run_turn(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    message: str,
    thread_id: uuid.UUID | None = None,
    request_id: str | None = None,
    provider: LLMProvider | None = None,
    settings: Settings | None = None,
) -> AgentTurnResult:
    settings = settings or get_settings()
    started = time.perf_counter()
    req_id = request_id or uuid.uuid4().hex[:16]

    if not settings.ai_enabled:
        conf_svc.write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="chat",
            status="disabled",
            request_id=req_id,
        )
        return AgentTurnResult(
            reply=(
                "O assistente de IA está desativado neste ambiente. "
                "Ative AI_ENABLED e configure o provedor para usar."
            ),
            status="disabled",
        )

    text = (message or "").strip()
    if not text:
        raise AuthError("validation_error", "Informe uma mensagem.", 422)
    if len(text) > settings.llm_max_input_chars:
        raise AuthError(
            "input_too_long",
            f"Mensagem excede {settings.llm_max_input_chars} caracteres.",
            422,
        )

    entitlement = SubscriptionEntitlementService(db).get_for_organization(organization_id)
    if not entitlement.has_active_access:
        raise AuthError(
            "subscription_required",
            "É necessário ter uma assinatura ativa para usar o assistente.",
            403,
        )

    _check_minute_rate_limit(settings, user_id=user_id)
    _check_org_daily_limit(db, settings, organization_id=organization_id)
    _check_hourly_rate_limit(settings, org_id=organization_id, user_id=user_id)

    try:
        llm = build_provider(settings, override=provider)
    except ProviderError as exc:
        conf_svc.write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="chat",
            status="error",
            error_sanitized=exc.code,
            request_id=req_id,
        )
        return AgentTurnResult(reply=exc.message, status="error")

    thread = threads_svc.get_or_create_thread(
        db,
        organization_id=organization_id,
        user_id=user_id,
        thread_id=thread_id,
        title_hint=text,
    )
    user_message = threads_svc.append_message(
        db, thread=thread, role="user", content=text, message_type="text", user_id=user_id
    )
    history = threads_svc.list_recent_messages(db, thread_id=thread.id, limit=HISTORY_LIMIT)

    model = settings.resolved_llm_model
    run_row = AgentRun(
        thread_id=thread.id,
        message_id=user_message.id,
        organization_id=organization_id,
        user_id=user_id,
        provider=settings.llm_provider,
        model=model,
        status="running",
    )
    db.add(run_row)
    db.commit()
    db.refresh(run_row)

    _increment_usage_daily(db, organization_id=organization_id, requests=1)

    messages: list[LLMMessage] = [LLMMessage(role="system", content=get_system_prompt())]
    for row in history:
        if row.role in {"user", "assistant"}:
            messages.append(LLMMessage(role=row.role, content=row.content))

    tools = tool_specs()
    ctx = ToolContext(
        organization_id=organization_id,
        user_id=user_id,
        db=db,
        request_id=req_id,
    )
    tool_trace: list[str] = []
    usage_total = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cached_input_tokens": 0,
        "reasoning_tokens": 0,
        "model": model,
    }
    pending_action: dict[str, Any] | None = None
    provider_request_id: str | None = None

    def _finish_run(*, status: str, error_code: str | None = None) -> None:
        run_row.status = status
        run_row.finished_at = datetime.now(UTC)
        run_row.latency_ms = int((time.perf_counter() - started) * 1000)
        run_row.input_tokens = usage_total["input_tokens"]
        run_row.cached_input_tokens = usage_total["cached_input_tokens"]
        run_row.output_tokens = usage_total["output_tokens"]
        run_row.reasoning_tokens = usage_total["reasoning_tokens"]
        cost_cents = _usage_cost_cents(
            settings,
            input_tokens=usage_total["input_tokens"],
            output_tokens=usage_total["output_tokens"],
        )
        run_row.estimated_cost_cents = cost_cents
        run_row.provider_request_id = provider_request_id
        run_row.error_code = error_code
        db.add(run_row)
        db.commit()
        _increment_usage_daily(
            db,
            organization_id=organization_id,
            input_tokens=usage_total["input_tokens"],
            output_tokens=usage_total["output_tokens"],
            cost_cents=cost_cents,
            errors=0 if status in {"ok", "awaiting_confirmation"} else 1,
        )

    try:
        for _step in range(settings.llm_max_tool_steps):
            response = llm.complete(
                messages=messages,
                tools=tools,
                model=model,
                timeout_seconds=settings.llm_timeout_seconds,
            )
            usage_total["input_tokens"] += response.usage.input_tokens
            usage_total["output_tokens"] += response.usage.output_tokens
            usage_total["cached_input_tokens"] += response.usage.cached_input_tokens
            usage_total["reasoning_tokens"] += response.usage.reasoning_tokens
            if response.usage.model:
                usage_total["model"] = response.usage.model
            if response.provider_request_id:
                provider_request_id = response.provider_request_id

            if not response.tool_calls:
                reply = (response.content or "").strip() or (
                    "Não consegui produzir uma resposta útil."
                )
                threads_svc.append_message(
                    db,
                    thread=thread,
                    role="assistant",
                    content=reply,
                    message_type="text",
                )
                _finish_run(status="ok")
                _record_metrics(started, ok=True, tools=len(tool_trace), usage=usage_total)
                conf_svc.write_audit(
                    db,
                    organization_id=organization_id,
                    user_id=user_id,
                    operation="chat",
                    status="ok",
                    request_id=req_id,
                    metadata_safe={
                        "tool_steps": len(tool_trace),
                        "model": usage_total.get("model"),
                        "input_tokens": usage_total["input_tokens"],
                        "output_tokens": usage_total["output_tokens"],
                    },
                )
                return AgentTurnResult(
                    reply=reply,
                    pending_action=pending_action,
                    tool_trace=tool_trace,
                    usage=_usage_with_cost(settings, usage_total),
                    status="ok",
                    thread_id=str(thread.id),
                )

            # Append assistant tool call message
            messages.append(
                LLMMessage(
                    role="assistant",
                    content=response.content,
                    tool_calls=[
                        {
                            "id": tc.get("id") or f"call_{i}",
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": json.dumps(tc.get("arguments") or {}),
                            },
                        }
                        for i, tc in enumerate(response.tool_calls)
                    ],
                )
            )

            for tc in response.tool_calls:
                name = tc.get("name") or ""
                args = tc.get("arguments") or {}
                call_id = tc.get("id") or "call"
                tool_trace.append(name)
                tool_started = time.perf_counter()
                try:
                    tool = get_tool(name)
                except AuthError as exc:
                    conf_svc.write_audit(
                        db,
                        organization_id=organization_id,
                        user_id=user_id,
                        operation="tool_denied",
                        status="error",
                        tool_name=name,
                        error_sanitized=exc.code,
                        request_id=req_id,
                    )
                    _log_tool_call(
                        db,
                        run_id=run_row.id,
                        organization_id=organization_id,
                        user_id=user_id,
                        tool_name=name,
                        risk_class="forbidden",
                        arguments_safe=None,
                        result_safe={"error": exc.message, "code": exc.code},
                        status="error",
                        latency_ms=int((time.perf_counter() - tool_started) * 1000),
                    )
                    messages.append(
                        LLMMessage(
                            role="tool",
                            tool_call_id=call_id,
                            name=name,
                            content=json.dumps({"error": exc.message}),
                        )
                    )
                    continue

                # Strip any tenant fields the model may invent
                if isinstance(args, dict):
                    args = {
                        k: v
                        for k, v in args.items()
                        if k
                        not in {
                            "organization_id",
                            "tenant_id",
                            "user_id",
                            "db",
                            "sql",
                        }
                    }

                try:
                    result = tool.handler(ctx, args if isinstance(args, dict) else {})
                except AuthError as exc:
                    result = {"error": exc.message, "code": exc.code}
                except Exception:
                    logger.exception("tool_error name=%s", name)
                    result = {"error": "Falha ao executar a ferramenta.", "code": "tool_error"}

                tool_latency_ms = int((time.perf_counter() - tool_started) * 1000)
                is_error = isinstance(result, dict) and "error" in result
                conf_svc.write_audit(
                    db,
                    organization_id=organization_id,
                    user_id=user_id,
                    operation="tool_call",
                    status="ok" if not is_error else "error",
                    tool_name=name,
                    confirmation_required=tool.requires_confirmation,
                    request_id=req_id,
                    error_sanitized=result.get("code") if isinstance(result, dict) else None,
                    metadata_safe={"kind": tool.kind},
                )
                _log_tool_call(
                    db,
                    run_id=run_row.id,
                    organization_id=organization_id,
                    user_id=user_id,
                    tool_name=name,
                    risk_class=tool.risk_class,
                    arguments_safe=args if isinstance(args, dict) else None,
                    result_safe=result if isinstance(result, dict) else None,
                    status="ok" if not is_error else "error",
                    latency_ms=tool_latency_ms,
                )

                if tool.requires_confirmation and result.get("needs_confirmation"):
                    row = conf_svc.create_pending_action(
                        db,
                        organization_id=organization_id,
                        user_id=user_id,
                        tool_name=result.get("tool_name") or name,
                        arguments=result["arguments"],
                        summary_text=result["summary"],
                        thread_id=thread.id,
                        risk_class=result.get("risk_class", tool.risk_class),
                        summary_fields=result.get("summary_fields"),
                        request_id=req_id,
                    )
                    pending_action = {
                        "id": str(row.id),
                        "thread_id": str(thread.id),
                        "tool_name": row.tool_name,
                        "risk_class": row.risk_class,
                        "summary": row.summary_text,
                        "summary_fields": row.summary_fields,
                        "arguments": row.arguments,
                        "expires_at": row.expires_at.isoformat(),
                    }
                    messages.append(
                        LLMMessage(
                            role="tool",
                            tool_call_id=call_id,
                            name=name,
                            content=json.dumps(
                                {
                                    "status": "awaiting_confirmation",
                                    "summary": row.summary_text,
                                    "pending_action_id": str(row.id),
                                }
                            ),
                        )
                    )
                else:
                    messages.append(
                        LLMMessage(
                            role="tool",
                            tool_call_id=call_id,
                            name=name,
                            content=json.dumps(result, default=str),
                        )
                    )

            if pending_action:
                threads_svc.append_message(
                    db,
                    thread=thread,
                    role="assistant",
                    content=pending_action["summary"],
                    message_type="pending_card",
                    metadata_safe={
                        "pending_action_id": pending_action["id"],
                        "tool_name": pending_action["tool_name"],
                        "summary_fields": pending_action.get("summary_fields"),
                    },
                )
                _finish_run(status="awaiting_confirmation")
                _record_metrics(started, ok=True, tools=len(tool_trace), usage=usage_total)
                return AgentTurnResult(
                    reply=(
                        "Preciso da sua confirmação antes de continuar.\n\n"
                        f"{pending_action['summary']}"
                    ),
                    pending_action=pending_action,
                    tool_trace=tool_trace,
                    usage=_usage_with_cost(settings, usage_total),
                    status="awaiting_confirmation",
                    thread_id=str(thread.id),
                )

        # Step limit reached
        conf_svc.write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="chat",
            status="step_limit",
            request_id=req_id,
            metadata_safe={"tool_steps": len(tool_trace)},
        )
        _finish_run(status="step_limit", error_code="step_limit")
        _record_metrics(started, ok=False, tools=len(tool_trace), usage=usage_total)
        return AgentTurnResult(
            reply=(
                "Atingi o limite de passos desta consulta. "
                "Reformule o pedido de forma mais direta."
            ),
            tool_trace=tool_trace,
            usage=_usage_with_cost(settings, usage_total),
            status="step_limit",
            thread_id=str(thread.id),
        )
    except ProviderTimeoutError as exc:
        _finish_run(status="error", error_code=exc.code)
        _record_metrics(started, ok=False, tools=len(tool_trace), usage=usage_total)
        conf_svc.write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="chat",
            status="error",
            error_sanitized=exc.code,
            request_id=req_id,
        )
        return AgentTurnResult(
            reply=exc.message, status="error", tool_trace=tool_trace, thread_id=str(thread.id)
        )
    except ProviderError as exc:
        _finish_run(status="error", error_code=exc.code)
        _record_metrics(started, ok=False, tools=len(tool_trace), usage=usage_total)
        conf_svc.write_audit(
            db,
            organization_id=organization_id,
            user_id=user_id,
            operation="chat",
            status="error",
            error_sanitized=exc.code,
            request_id=req_id,
        )
        return AgentTurnResult(
            reply=exc.message, status="error", tool_trace=tool_trace, thread_id=str(thread.id)
        )


def _usage_with_cost(settings: Settings, usage: dict[str, Any]) -> dict[str, Any]:
    inp = int(usage.get("input_tokens") or 0)
    out = int(usage.get("output_tokens") or 0)
    cost = (inp / 1000.0) * settings.llm_input_token_cost_per_1k + (
        out / 1000.0
    ) * settings.llm_output_token_cost_per_1k
    return {**usage, "estimated_cost": round(cost, 6)}


def _record_metrics(
    started: float, *, ok: bool, tools: int, usage: dict[str, Any]
) -> None:
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    with _metrics_lock:
        _metrics.requests += 1
        if not ok:
            _metrics.errors += 1
        _metrics.tool_calls += tools
        _metrics.input_tokens += int(usage.get("input_tokens") or 0)
        _metrics.output_tokens += int(usage.get("output_tokens") or 0)
        _metrics.latency_ms_total += elapsed_ms


def get_metrics_snapshot() -> dict[str, Any]:
    with _metrics_lock:
        avg = (
            _metrics.latency_ms_total / _metrics.requests if _metrics.requests else 0
        )
        return {
            "requests": _metrics.requests,
            "errors": _metrics.errors,
            "tool_calls": _metrics.tool_calls,
            "input_tokens": _metrics.input_tokens,
            "output_tokens": _metrics.output_tokens,
            "avg_latency_ms": round(avg, 2),
        }
