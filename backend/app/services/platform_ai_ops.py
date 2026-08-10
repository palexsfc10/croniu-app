"""Platform AI operations metrics (sanitized — no conversation bodies, no secrets)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.agent import AgentPendingAction, AgentRun, AgentUsageDaily


def get_ai_ops_overview(db: Session) -> dict:
    settings = get_settings()
    today = datetime.now(UTC).date()
    month_start = today.replace(day=1)

    usage_today = db.execute(
        select(
            func.coalesce(func.sum(AgentUsageDaily.requests), 0),
            func.coalesce(func.sum(AgentUsageDaily.input_tokens), 0),
            func.coalesce(func.sum(AgentUsageDaily.output_tokens), 0),
            func.coalesce(func.sum(AgentUsageDaily.estimated_cost_cents), 0),
            func.coalesce(func.sum(AgentUsageDaily.errors), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_transcriptions), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_audio_seconds), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_errors), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_latency_ms_sum), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_estimated_cost_cents), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_rate_limit_blocks), 0),
        ).where(AgentUsageDaily.day == today)
    ).one()

    usage_month = db.execute(
        select(
            func.coalesce(func.sum(AgentUsageDaily.requests), 0),
            func.coalesce(func.sum(AgentUsageDaily.input_tokens), 0),
            func.coalesce(func.sum(AgentUsageDaily.output_tokens), 0),
            func.coalesce(func.sum(AgentUsageDaily.estimated_cost_cents), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_transcriptions), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_audio_seconds), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_estimated_cost_cents), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_errors), 0),
            func.coalesce(func.sum(AgentUsageDaily.voice_rate_limit_blocks), 0),
        ).where(AgentUsageDaily.day >= month_start)
    ).one()

    pending = db.scalar(
        select(func.count()).select_from(AgentPendingAction).where(
            AgentPendingAction.status == "pending"
        )
    ) or 0
    executed = db.scalar(
        select(func.count()).select_from(AgentPendingAction).where(
            AgentPendingAction.status == "executed",
            AgentPendingAction.executed_at >= datetime.now(UTC) - timedelta(days=30),
        )
    ) or 0
    cancelled = db.scalar(
        select(func.count()).select_from(AgentPendingAction).where(
            AgentPendingAction.status == "cancelled",
            AgentPendingAction.created_at >= datetime.now(UTC) - timedelta(days=30),
        )
    ) or 0
    expired = db.scalar(
        select(func.count()).select_from(AgentPendingAction).where(
            AgentPendingAction.status == "expired",
            AgentPendingAction.created_at >= datetime.now(UTC) - timedelta(days=30),
        )
    ) or 0

    latency = db.execute(
        select(
            func.avg(AgentRun.latency_ms),
            func.count(),
        ).where(
            AgentRun.started_at >= datetime.now(UTC) - timedelta(days=7),
            AgentRun.latency_ms.is_not(None),
        )
    ).one()

    top_orgs = db.execute(
        select(
            AgentUsageDaily.organization_id,
            func.sum(AgentUsageDaily.requests).label("requests"),
            func.sum(AgentUsageDaily.input_tokens + AgentUsageDaily.output_tokens).label("tokens"),
            func.sum(AgentUsageDaily.voice_transcriptions).label("voice_transcriptions"),
            func.sum(AgentUsageDaily.voice_audio_seconds).label("voice_audio_seconds"),
        )
        .where(AgentUsageDaily.day >= month_start)
        .group_by(AgentUsageDaily.organization_id)
        .order_by(func.sum(AgentUsageDaily.requests).desc())
        .limit(10)
    ).all()

    voice_tx_today = int(usage_today[5] or 0)
    voice_latency_sum = int(usage_today[8] or 0)
    avg_voice_latency = (
        float(voice_latency_sum) / voice_tx_today if voice_tx_today > 0 else None
    )

    return {
        "configured": True,
        "ai_enabled": bool(settings.ai_enabled),
        "provider": settings.llm_provider,
        "model": settings.resolved_llm_model,
        "api_key_configured": bool(settings.resolved_llm_api_key),
        "generated_at": datetime.now(UTC).isoformat(),
        "requests_today": int(usage_today[0] or 0),
        "tokens_today": int((usage_today[1] or 0) + (usage_today[2] or 0)),
        "estimated_cost_cents_today": int(usage_today[3] or 0),
        "errors_today": int(usage_today[4] or 0),
        "requests_month": int(usage_month[0] or 0),
        "tokens_month": int((usage_month[1] or 0) + (usage_month[2] or 0)),
        "estimated_cost_cents_month": int(usage_month[3] or 0),
        "avg_latency_ms_7d": float(latency[0]) if latency[0] is not None else None,
        "runs_7d": int(latency[1] or 0),
        "actions_pending": int(pending),
        "actions_executed_30d": int(executed),
        "actions_cancelled_30d": int(cancelled),
        "actions_expired_30d": int(expired),
        "voice": {
            "enabled": bool(settings.voice_enabled),
            "transcription_model": settings.openai_transcription_model,
            "transcriptions_today": voice_tx_today,
            "audio_seconds_today": int(usage_today[6] or 0),
            "errors_today": int(usage_today[7] or 0),
            "avg_latency_ms_today": avg_voice_latency,
            "estimated_cost_cents_today": int(usage_today[9] or 0),
            "rate_limit_blocks_today": int(usage_today[10] or 0),
            "transcriptions_month": int(usage_month[4] or 0),
            "audio_seconds_month": int(usage_month[5] or 0),
            "estimated_cost_cents_month": int(usage_month[6] or 0),
            "errors_month": int(usage_month[7] or 0),
            "rate_limit_blocks_month": int(usage_month[8] or 0),
            "max_seconds": settings.voice_max_seconds,
            "max_bytes": settings.voice_max_bytes,
        },
        "limits": {
            "user_requests_per_minute": settings.ai_user_requests_per_minute,
            "org_daily_request_limit": settings.ai_org_daily_request_limit,
            "confirmation_ttl_seconds": settings.ai_confirmation_ttl_seconds,
            "voice_user_requests_per_minute": settings.voice_user_requests_per_minute,
            "voice_org_daily_request_limit": settings.voice_org_daily_request_limit,
        },
        "top_organizations_month": [
            {
                "organization_id": str(row[0]),
                "requests": int(row[1] or 0),
                "tokens": int(row[2] or 0),
                "voice_transcriptions": int(row[3] or 0),
                "voice_audio_seconds": int(row[4] or 0),
            }
            for row in top_orgs
        ],
        "note": "Conteúdo de conversas e transcrições não é exposto neste painel.",
    }
