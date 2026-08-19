"""BILLING_SANDBOX_ALLOW_ALL — explicit, fail-closed HML-only checkout release.

See docs/REFERRAL_PROGRAM.md and ADR-043 for the incident this guards
against: a growing manual allowlist silently blocked every HML account
except the handful of hardcoded IDs, including real accounts.
"""

from __future__ import annotations

import uuid

import pytest
from app.billing.config import (
    get_billing_runtime_status,
    is_checkout_allowed_for_org,
    is_sandbox_allow_all_active,
)
from app.config import get_settings


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _base_ready_settings(monkeypatch, settings):
    """Minimal config so credentials/config_valid don't mask the allowlist logic."""
    monkeypatch.setattr(settings, "billing_enabled", True)
    monkeypatch.setattr(settings, "billing_checkout_enabled", True)
    monkeypatch.setattr(settings, "asaas_api_key", "test_key_$aact_hmlg_x")
    monkeypatch.setattr(settings, "asaas_webhook_token", "whk_test")
    monkeypatch.setattr(settings, "asaas_api_url", "https://sandbox.asaas.com/api/v3")
    monkeypatch.setattr(settings, "billing_sandbox_allowlist_org_ids", "")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", False)


def test_hml_sandbox_with_global_release_allows_any_org(monkeypatch):
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)

    status = get_billing_runtime_status()
    assert status.sandbox_allow_all_active is True
    assert status.checkout_globally_enabled is True

    random_org = uuid.uuid4()
    assert is_checkout_allowed_for_org(random_org) is True


def test_hml_sandbox_restricted_by_allowlist_when_flag_off(monkeypatch):
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    allowed_org = uuid.uuid4()
    monkeypatch.setattr(settings, "billing_sandbox_allowlist_org_ids", str(allowed_org))
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", False)

    status = get_billing_runtime_status()
    assert status.sandbox_allow_all_active is False
    assert status.allowlist_active is True

    assert is_checkout_allowed_for_org(allowed_org) is True
    assert is_checkout_allowed_for_org(uuid.uuid4()) is False


def test_hml_sandbox_blocks_every_org_when_neither_allowlist_nor_allow_all(monkeypatch):
    """The exact bug reported: no allowlist entry and no allow-all == everyone blocked."""
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")

    status = get_billing_runtime_status()
    assert status.checkout_globally_enabled is False
    assert is_checkout_allowed_for_org(uuid.uuid4()) is False


def test_production_never_released_by_hml_flag(monkeypatch):
    """Fail-closed: BILLING_SANDBOX_ALLOW_ALL=true leaking into prod config has zero effect.

    Real production Asaas is intentionally *not* gated by the HML sandbox
    allowlist/allow-all mechanism at all (sandbox_mode=False skips that block
    entirely) — access there is controlled by billing_enabled/credentials,
    a separate and pre-existing concern. What this guards against
    specifically is the flag ever being the reason checkout opens up.
    """
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "production")
    monkeypatch.setattr(settings, "asaas_environment", "production")
    monkeypatch.setattr(settings, "asaas_api_url", "https://api.asaas.com/v3")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)

    assert is_sandbox_allow_all_active() is False
    status = get_billing_runtime_status()
    assert status.sandbox_allow_all_active is False
    assert "billing_sandbox_allow_all_ignored_outside_hml_sandbox" in status.issues

    # Now prove the flag is inert: disabling billing must still block checkout
    # in production, exactly as it would with the flag entirely absent.
    monkeypatch.setattr(settings, "billing_enabled", False)
    assert is_checkout_allowed_for_org(uuid.uuid4()) is False


def test_flag_ignored_when_hml_env_but_asaas_environment_is_production(monkeypatch):
    """Extra fail-closed layer: HML env alone is not enough — Asaas itself must be sandbox."""
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "production")
    monkeypatch.setattr(settings, "asaas_api_url", "https://api.asaas.com/v3")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)

    assert is_sandbox_allow_all_active() is False


def test_flag_ignored_when_asaas_sandbox_but_env_not_hml(monkeypatch):
    """Development/test environments don't get the HML-only bypass either."""
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "development")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)

    assert is_sandbox_allow_all_active() is False


def test_invalid_asaas_config_fails_closed_even_with_allow_all(monkeypatch):
    """A misconfigured environment (bad API URL for the declared env) must never grant access."""
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)
    # Sandbox env declared but URL points at production Asaas — invalid combo.
    monkeypatch.setattr(settings, "asaas_api_url", "https://api.asaas.com/v3")

    status = get_billing_runtime_status()
    assert status.config_valid is False
    assert is_checkout_allowed_for_org(uuid.uuid4()) is False


def test_missing_credentials_fails_closed_even_with_allow_all(monkeypatch):
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)
    monkeypatch.setattr(settings, "asaas_api_key", "")

    status = get_billing_runtime_status()
    assert status.asaas_credentials_present is False
    assert is_checkout_allowed_for_org(uuid.uuid4()) is False


def test_billing_disabled_fails_closed_even_with_allow_all(monkeypatch):
    settings = get_settings()
    _base_ready_settings(monkeypatch, settings)
    monkeypatch.setattr(settings, "croniu_env", "hml")
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "billing_sandbox_allow_all", True)
    monkeypatch.setattr(settings, "billing_enabled", False)

    assert is_checkout_allowed_for_org(uuid.uuid4()) is False
