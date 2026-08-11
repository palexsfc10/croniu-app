"""Tests for billing setup status discrimination (abandoned hosted checkout)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.billing.setup_status import (
    BillingSetupStatus,
    resolve_billing_setup,
    sanitize_resume_checkout_url,
)
from app.models.billing import BillingCheckoutStatus, SubscriptionStatus


def _sub(**kwargs):
    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        plan_code="starter",
        plan_id=None,
        price_id=None,
        status=SubscriptionStatus.TRIAL.value,
        trial_ends_at=now + timedelta(days=5),
        trial_started_at=now - timedelta(days=2),
        started_at=now - timedelta(days=2),
        payment_status="none",
        provider="asaas",
        provider_subscription_id=None,
        provider_checkout_id=None,
        country_code="BR",
        currency="BRL",
        billing_type="CREDIT_CARD",
        next_billing_at=None,
        grace_period_ends_at=None,
        cancelled_at=None,
        cancellation_effective_at=None,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _checkout(**kwargs):
    now = datetime.now(UTC)
    defaults = dict(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        status=BillingCheckoutStatus.ACTIVE.value,
        paid_at=None,
        checkout_url="https://sandbox.asaas.com/checkoutSession/i/abc",
        expires_at=now + timedelta(hours=1),
        provider_checkout_id="chk_1",
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_open_unpaid_checkout_is_checkout_pending():
    sub = _sub(provider_checkout_id="chk_only")
    checkout = _checkout()
    setup = resolve_billing_setup(
        sub,
        checkout,
        gateway_checkout_available=True,
    )
    assert setup.billing_setup_status == BillingSetupStatus.CHECKOUT_PENDING
    assert setup.payment_prepared is False
    assert setup.can_resume_checkout is True
    assert setup.can_start_checkout is False


def test_provider_checkout_id_alone_is_not_paid():
    """provider_checkout_id without paid payment_status must not mean paid."""
    sub = _sub(provider_checkout_id="chk_only", payment_status="none")
    checkout = _checkout(status=BillingCheckoutStatus.ACTIVE.value, paid_at=None)
    setup = resolve_billing_setup(sub, checkout, gateway_checkout_available=True)
    assert setup.billing_setup_status != BillingSetupStatus.PAID
    assert setup.billing_setup_status == BillingSetupStatus.CHECKOUT_PENDING
    assert setup.payment_prepared is False


def test_paid_payment_status_is_paid():
    sub = _sub(
        status=SubscriptionStatus.ACTIVE.value,
        payment_status="confirmed",
        provider_subscription_id="sub_123",
    )
    setup = resolve_billing_setup(sub, None, gateway_checkout_available=True)
    assert setup.billing_setup_status == BillingSetupStatus.PAID
    assert setup.can_start_checkout is False


def test_unsafe_resume_url_rejected():
    assert sanitize_resume_checkout_url("http://sandbox.asaas.com/x") is None
    assert sanitize_resume_checkout_url("https://evil.com/x") is None
    assert sanitize_resume_checkout_url("https://sandbox.asaas.com.evil.com/x") is None
    assert (
        sanitize_resume_checkout_url("https://sandbox.asaas.com/checkoutSession/i/1")
        is not None
    )
