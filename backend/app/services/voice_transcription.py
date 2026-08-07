"""Authenticated STT for the assistant — temp file only, no permanent audio storage."""

from __future__ import annotations

import logging
import os
import tempfile
import threading
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.billing.entitlement import SubscriptionEntitlementService
from app.config import Settings, get_settings
from app.models.agent import AgentUsageDaily
from app.services.auth import AuthError

logger = logging.getLogger("croniu.agent.voice")

_minute_lock = threading.Lock()
_minute_buckets: dict[str, list[float]] = defaultdict(list)

# MIME → preferred filename suffix for OpenAI multipart
_MIME_SUFFIX = {
    "audio/webm": ".webm",
    "audio/webm;codecs=opus": ".webm",
    "video/webm": ".webm",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/ogg;codecs=opus": ".ogg",
}


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    model: str
    duration_seconds: float | None
    latency_ms: int
    bytes_received: int
    mime_type: str
    estimated_cost_cents: int
    request_id: str


def voice_status(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    return {
        "voice_enabled": bool(settings.voice_enabled),
        "transcription_model": settings.openai_transcription_model,
        "max_seconds": settings.voice_max_seconds,
        "max_bytes": settings.voice_max_bytes,
        "allowed_mime_types": sorted(settings.voice_mime_allowlist),
    }


def _sanitize_request_id(raw: str | None) -> str:
    if not raw:
        return uuid.uuid4().hex[:16]
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in "-_")[:64]
    return cleaned or uuid.uuid4().hex[:16]


def _normalize_mime(content_type: str | None) -> str:
    if not content_type:
        return ""
    return content_type.split(";")[0].strip().lower()


def _check_voice_minute_limit(settings: Settings, *, user_id: uuid.UUID) -> None:
    key = str(user_id)
    now = time.time()
    window = 60.0
    with _minute_lock:
        bucket = [t for t in _minute_buckets[key] if now - t < window]
        if len(bucket) >= settings.voice_user_requests_per_minute:
            _minute_buckets[key] = bucket
            raise AuthError(
                "voice_rate_limited",
                "Você está enviando áudios rápido demais. Aguarde um instante.",
                429,
            )
        bucket.append(now)
        _minute_buckets[key] = bucket


def _get_or_create_usage_row(
    db: Session, *, organization_id: uuid.UUID
) -> AgentUsageDaily:
    today = datetime.now(UTC).date()
    row = db.get(AgentUsageDaily, (organization_id, today))
    if row is None:
        row = AgentUsageDaily(organization_id=organization_id, day=today)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _check_voice_daily_limit(
    db: Session, settings: Settings, *, organization_id: uuid.UUID
) -> None:
    row = _get_or_create_usage_row(db, organization_id=organization_id)
    if row.voice_transcriptions >= settings.voice_org_daily_request_limit:
        raise AuthError(
            "voice_org_daily_limit",
            "O limite diário de transcrições desta organização foi atingido.",
            429,
        )


def _increment_voice_usage(
    db: Session,
    *,
    organization_id: uuid.UUID,
    transcriptions: int = 0,
    audio_seconds: int = 0,
    errors: int = 0,
    latency_ms: int = 0,
    cost_cents: int = 0,
    rate_limit_blocks: int = 0,
) -> None:
    row = _get_or_create_usage_row(db, organization_id=organization_id)
    row.voice_transcriptions += transcriptions
    row.voice_audio_seconds += audio_seconds
    row.voice_errors += errors
    row.voice_latency_ms_sum += latency_ms
    row.voice_estimated_cost_cents += cost_cents
    row.voice_rate_limit_blocks += rate_limit_blocks
    db.add(row)
    db.commit()


def _estimate_cost_cents(settings: Settings, *, duration_seconds: float | None) -> int:
    if duration_seconds is None or duration_seconds <= 0:
        return 0
    minutes = duration_seconds / 60.0
    return max(0, round(minutes * settings.voice_cost_per_minute_cents))


def transcribe_audio(
    db: Session,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    audio_bytes: bytes,
    content_type: str | None,
    duration_hint_seconds: float | None = None,
    request_id: str | None = None,
    settings: Settings | None = None,
) -> TranscriptionResult:
    settings = settings or get_settings()
    rid = _sanitize_request_id(request_id)

    if not settings.voice_enabled:
        raise AuthError(
            "voice_disabled",
            "A entrada por voz está desativada neste ambiente.",
            503,
        )
    if not settings.ai_enabled:
        raise AuthError(
            "ai_disabled",
            "O assistente está desativado neste ambiente.",
            503,
        )

    snap = SubscriptionEntitlementService(db).get_for_organization(organization_id)
    if not snap.has_active_access:
        raise AuthError(
            "billing_access_denied",
            "Sua assinatura ou período de teste não permite usar o assistente agora.",
            402,
        )

    try:
        _check_voice_minute_limit(settings, user_id=user_id)
        _check_voice_daily_limit(db, settings, organization_id=organization_id)
    except AuthError as exc:
        if exc.code in {"voice_rate_limited", "voice_org_daily_limit"}:
            try:
                _increment_voice_usage(
                    db, organization_id=organization_id, rate_limit_blocks=1
                )
            except Exception:
                logger.warning("voice_metric_rate_block_failed request_id=%s", rid)
        raise

    size = len(audio_bytes)
    if size <= 0:
        _increment_voice_usage(db, organization_id=organization_id, errors=1)
        raise AuthError(
            "voice_empty",
            "Não identificamos áudio neste envio. Tente gravar novamente.",
            400,
        )
    if size > settings.voice_max_bytes:
        _increment_voice_usage(db, organization_id=organization_id, errors=1)
        raise AuthError(
            "voice_too_large",
            "O áudio ultrapassou o tamanho máximo permitido. Grave um trecho mais curto.",
            413,
        )

    if duration_hint_seconds is not None and duration_hint_seconds > settings.voice_max_seconds + 2:
        _increment_voice_usage(db, organization_id=organization_id, errors=1)
        raise AuthError(
            "voice_too_long",
            f"A gravação pode ter no máximo {settings.voice_max_seconds} segundos.",
            400,
        )

    raw_mime = (content_type or "").strip().lower()
    base_mime = _normalize_mime(raw_mime)
    allow = settings.voice_mime_allowlist
    if raw_mime not in allow and base_mime not in allow:
        _increment_voice_usage(db, organization_id=organization_id, errors=1)
        raise AuthError(
            "voice_unsupported_format",
            "Este formato de áudio não é suportado. Tente gravar novamente pelo navegador.",
            415,
        )

    api_key = settings.resolved_llm_api_key
    if not api_key:
        _increment_voice_usage(db, organization_id=organization_id, errors=1)
        raise AuthError(
            "voice_provider_unavailable",
            "A transcrição está temporariamente indisponível.",
            503,
        )

    suffix = _MIME_SUFFIX.get(raw_mime) or _MIME_SUFFIX.get(base_mime) or ".webm"
    tmp_path: Path | None = None
    started = time.perf_counter()
    try:
        fd, name = tempfile.mkstemp(prefix="croniu-voice-", suffix=suffix)
        tmp_path = Path(name)
        with os.fdopen(fd, "wb") as handle:
            handle.write(audio_bytes)
            handle.flush()
            os.fsync(handle.fileno())

        # Never log path contents; only sanitized request id + sizes
        logger.info(
            "voice_transcribe_start request_id=%s bytes=%s mime=%s model=%s",
            rid,
            size,
            base_mime or "unknown",
            settings.openai_transcription_model,
        )

        with httpx.Client(timeout=settings.voice_timeout_seconds) as client:
            with tmp_path.open("rb") as audio_file:
                # whisper-1 supports verbose_json (duration); newer STT models prefer json
                response_format = (
                    "verbose_json"
                    if settings.openai_transcription_model.startswith("whisper")
                    else "json"
                )
                response = client.post(
                    f"{settings.llm_api_base.rstrip('/')}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={
                        "file": (
                            f"audio{suffix}",
                            audio_file,
                            base_mime or "application/octet-stream",
                        )
                    },
                    data={
                        "model": settings.openai_transcription_model,
                        "response_format": response_format,
                    },
                )
    except httpx.TimeoutException as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        _increment_voice_usage(
            db, organization_id=organization_id, errors=1, latency_ms=latency_ms
        )
        logger.warning(
            "voice_transcribe_timeout request_id=%s latency_ms=%s", rid, latency_ms
        )
        raise AuthError(
            "voice_timeout",
            "A transcrição demorou mais que o esperado. Seu áudio não foi enviado ao assistente.",
            504,
        ) from exc
    except httpx.HTTPError as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        _increment_voice_usage(
            db, organization_id=organization_id, errors=1, latency_ms=latency_ms
        )
        logger.warning(
            "voice_transcribe_http_error request_id=%s latency_ms=%s", rid, latency_ms
        )
        raise AuthError(
            "voice_provider_unavailable",
            "Não foi possível transcrever o áudio agora. Tente novamente.",
            503,
        ) from exc
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("voice_temp_cleanup_failed request_id=%s", rid)

    latency_ms = int((time.perf_counter() - started) * 1000)

    if response.status_code >= 500:
        _increment_voice_usage(
            db, organization_id=organization_id, errors=1, latency_ms=latency_ms
        )
        logger.warning(
            "voice_transcribe_provider_5xx request_id=%s status=%s latency_ms=%s",
            rid,
            response.status_code,
            latency_ms,
        )
        raise AuthError(
            "voice_provider_unavailable",
            "Não foi possível transcrever o áudio agora. Tente novamente.",
            503,
        )

    if response.status_code >= 400:
        _increment_voice_usage(
            db, organization_id=organization_id, errors=1, latency_ms=latency_ms
        )
        logger.warning(
            "voice_transcribe_provider_4xx request_id=%s status=%s latency_ms=%s",
            rid,
            response.status_code,
            latency_ms,
        )
        # Do not forward OpenAI body
        raise AuthError(
            "voice_transcription_failed",
            "Não foi possível entender o áudio. Tente falar com mais clareza ou em local mais silencioso.",
            422,
        )

    try:
        payload = response.json()
    except Exception as exc:
        _increment_voice_usage(
            db, organization_id=organization_id, errors=1, latency_ms=latency_ms
        )
        raise AuthError(
            "voice_transcription_failed",
            "Não foi possível processar a transcrição. Tente novamente.",
            502,
        ) from exc

    text = str(payload.get("text") or "").strip()
    duration = payload.get("duration")
    duration_seconds: float | None
    try:
        duration_seconds = float(duration) if duration is not None else duration_hint_seconds
    except (TypeError, ValueError):
        duration_seconds = duration_hint_seconds

    if not text:
        _increment_voice_usage(
            db,
            organization_id=organization_id,
            transcriptions=1,
            audio_seconds=int(duration_seconds or 0),
            errors=1,
            latency_ms=latency_ms,
        )
        raise AuthError(
            "voice_silent",
            "Não identificamos fala nesse áudio. Tente novamente.",
            422,
        )

    cost = _estimate_cost_cents(settings, duration_seconds=duration_seconds)
    _increment_voice_usage(
        db,
        organization_id=organization_id,
        transcriptions=1,
        audio_seconds=int(round(duration_seconds or 0)),
        latency_ms=latency_ms,
        cost_cents=cost,
    )

    logger.info(
        "voice_transcribe_ok request_id=%s status=%s latency_ms=%s model=%s bytes=%s duration_s=%s cost_cents=%s",
        rid,
        response.status_code,
        latency_ms,
        settings.openai_transcription_model,
        size,
        int(duration_seconds or 0),
        cost,
    )

    return TranscriptionResult(
        text=text,
        model=settings.openai_transcription_model,
        duration_seconds=duration_seconds,
        latency_ms=latency_ms,
        bytes_received=size,
        mime_type=base_mime or raw_mime,
        estimated_cost_cents=cost,
        request_id=rid,
    )
