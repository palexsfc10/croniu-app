"""Resolve the configured e-mail provider."""

from __future__ import annotations

from app.config import Settings, get_settings
from app.email.fake import FakeEmailProvider
from app.email.protocols import EmailProvider
from app.email.resend import ResendEmailProvider

_shared_fake = FakeEmailProvider()
_cached_provider: EmailProvider | None = None
_cached_key: tuple[str, str, str, str, float] | None = None


def get_shared_fake_provider() -> FakeEmailProvider:
    return _shared_fake


def get_email_provider(settings: Settings | None = None) -> EmailProvider:
    global _cached_provider, _cached_key
    cfg = settings or get_settings()
    provider = (cfg.email_provider or "fake").strip().lower()
    key = (
        provider,
        cfg.resend_api_key or "",
        cfg.email_from,
        cfg.email_reply_to or "",
        float(cfg.email_timeout_seconds),
    )
    if _cached_provider is not None and _cached_key == key:
        return _cached_provider
    if provider in {"", "fake", "test", "noop"}:
        _cached_provider = _shared_fake
        _cached_key = key
        return _shared_fake
    if provider == "resend":
        _cached_provider = ResendEmailProvider(
            api_key=cfg.resend_api_key or "",
            from_address=cfg.email_from,
            reply_to=cfg.email_reply_to or None,
            timeout_seconds=cfg.email_timeout_seconds,
        )
        _cached_key = key
        return _cached_provider
    raise ValueError(f"Unsupported EMAIL_PROVIDER: {provider}")


def reset_email_provider_cache() -> None:
    global _cached_provider, _cached_key
    _cached_provider = None
    _cached_key = None
    _shared_fake.clear()
