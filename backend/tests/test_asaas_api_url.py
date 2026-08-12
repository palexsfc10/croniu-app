"""Unit tests for Asaas API URL normalization (RC2.8 checkout fix)."""

from __future__ import annotations

from app.billing.asaas_url import (
    PRODUCTION_CANONICAL,
    SANDBOX_LEGACY,
    normalize_asaas_api_url,
)


def test_production_misconfigured_api_v3_path_is_rewritten():
    assert (
        normalize_asaas_api_url(
            "https://api.asaas.com/api/v3",
            environment="production",
        )
        == PRODUCTION_CANONICAL
    )


def test_production_canonical_unchanged():
    assert (
        normalize_asaas_api_url(
            "https://api.asaas.com/v3/",
            environment="production",
        )
        == PRODUCTION_CANONICAL
    )


def test_legacy_www_host_rewritten_to_api_host():
    assert (
        normalize_asaas_api_url(
            "https://www.asaas.com/api/v3",
            environment="production",
        )
        == PRODUCTION_CANONICAL
    )


def test_sandbox_legacy_preserved():
    assert (
        normalize_asaas_api_url(
            "https://sandbox.asaas.com/api/v3",
            environment="sandbox",
        )
        == SANDBOX_LEGACY
    )


def test_provider_uses_normalized_base(monkeypatch):
    from app.billing.asaas import AsaasBillingProvider
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "asaas_api_key", "test_key_not_real")
    monkeypatch.setattr(settings, "asaas_api_url", "https://api.asaas.com/api/v3")
    monkeypatch.setattr(settings, "asaas_environment", "production")
    provider = AsaasBillingProvider()
    assert provider.api_url.rstrip("/") == PRODUCTION_CANONICAL
