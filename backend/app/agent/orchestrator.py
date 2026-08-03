"""Agent orchestrator — LLM ↔ tools ↔ confirmation."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
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
from app.config import Settings, get_settings
from app.services.auth import AuthError

logger = logging.getLogger("croniu.agent")

_rate_lock = Lock()
_rate_buckets: dict[str, list[float]] = defaultdict(list)


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


def agent_status(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    return {
        "enabled": bool(settings.ai_enabled),
        "provider": settings.llm_provider,
        "model": settings.llm_model,
        "prompt_version": SYSTEM_PROMPT_VERSION,
        "max_tool_steps": settings.llm_max_tool_steps,
        "tools": sorted(TOOLS.keys()),
    }


def _check_rate_limit(settings: Settings, *, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    key = f"{org_id}:{user_id}"
    now = time.time()
    window = 3600.0
    with _rate_lock:
        bucket = [t for t in _rate_buckets[key] if now - t < window]
        if len(bucket) >= settings.ai_rate_limit_per_hour:
            _rate_buckets[key] = bucket
            raise AuthError(
                "ai_rate_limited",
                "Limite de uso do assistente atingido. Tente mais tarde.",
                429,
            )
        bucket.append(now)
        _rate_buckets[key] = bucket


def run_turn(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    message: str,
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

    _check_rate_limit(settings, org_id=organization_id, user_id=user_id)

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

    messages: list[LLMMessage] = [
        LLMMessage(role="system", content=get_system_prompt()),
        LLMMessage(role="user", content=text),
    ]
    tools = tool_specs()
    ctx = ToolContext(
        organization_id=organization_id,
        user_id=user_id,
        db=db,
        request_id=req_id,
    )
    tool_trace: list[str] = []
    usage_total = {"input_tokens": 0, "output_tokens": 0, "model": settings.llm_model}
    pending_action: dict[str, Any] | None = None

    try:
        for _step in range(settings.llm_max_tool_steps):
            response = llm.complete(
                messages=messages,
                tools=tools,
                model=settings.llm_model,
                timeout_seconds=settings.llm_timeout_seconds,
            )
            usage_total["input_tokens"] += response.usage.input_tokens
            usage_total["output_tokens"] += response.usage.output_tokens
            if response.usage.model:
                usage_total["model"] = response.usage.model

            if not response.tool_calls:
                reply = (response.content or "").strip() or (
                    "Não consegui produzir uma resposta útil."
                )
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

                conf_svc.write_audit(
                    db,
                    organization_id=organization_id,
                    user_id=user_id,
                    operation="tool_call",
                    status="ok" if "error" not in result else "error",
                    tool_name=name,
                    confirmation_required=tool.requires_confirmation,
                    request_id=req_id,
                    error_sanitized=result.get("code") if isinstance(result, dict) else None,
                    metadata_safe={"kind": tool.kind},
                )

                if tool.requires_confirmation and result.get("needs_confirmation"):
                    row = conf_svc.create_pending_action(
                        db,
                        organization_id=organization_id,
                        user_id=user_id,
                        tool_name=result.get("tool_name") or name,
                        arguments=result["arguments"],
                        summary_text=result["summary"],
                        request_id=req_id,
                    )
                    pending_action = {
                        "id": str(row.id),
                        "tool_name": row.tool_name,
                        "summary": row.summary_text,
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
        _record_metrics(started, ok=False, tools=len(tool_trace), usage=usage_total)
        return AgentTurnResult(
            reply=(
                "Atingi o limite de passos desta consulta. "
                "Reformule o pedido de forma mais direta."
            ),
            tool_trace=tool_trace,
            usage=_usage_with_cost(settings, usage_total),
            status="step_limit",
        )
    except ProviderTimeoutError as exc:
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
        return AgentTurnResult(reply=exc.message, status="error", tool_trace=tool_trace)
    except ProviderError as exc:
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
        return AgentTurnResult(reply=exc.message, status="error", tool_trace=tool_trace)


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
