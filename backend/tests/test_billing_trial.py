"""Trial created on register + entitlement access during trial."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select

from app.billing.entitlement import (
    SubscriptionEntitlementService,
    compute_trial_days_remaining,
)
from app.models.billing import Subscription, SubscriptionStatus


def test_register_creates_trial_subscription(client, register_payload, db_session):
    response = client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    org_id = response.json()["organization"]["id"]

    sub = db_session.scalar(
        select(Subscription).where(Subscription.organization_id == org_id)
    )
    assert sub is not None
    assert sub.status == SubscriptionStatus.TRIAL.value
    assert sub.payment_status == "none"
    assert sub.trial_ends_at is not None
    assert sub.plan_code == "starter"


def test_entitlement_has_active_access_during_trial(client, register_payload, db_session):
    response = client.post("/api/v1/auth/register", json=register_payload)
    org_id = response.json()["organization"]["id"]

    snap = SubscriptionEntitlementService(db_session).get_for_organization(
        UUID(org_id),
        persist_lazy_transitions=False,
    )
    assert snap.has_active_access is True
    assert snap.can_write is True
    assert snap.subscription_status == "trial"
    assert snap.payment_status == "none"
    assert snap.trial_days_remaining == 7

    api = client.get("/api/v1/billing/entitlement")
    assert api.status_code == 200
    body = api.json()
    assert body["has_active_access"] is True
    assert body["subscription_status"] == "trial"
    assert body["trial_days_remaining"] == 7
    assert body["payment_status"] == "none"


def test_compute_trial_days_remaining_ceil_and_boundaries():
    now = datetime(2026, 8, 7, 12, 0, 0, tzinfo=UTC)

    # Fresh 7-day window (even 1s later) must still show 7, not 6.
    assert (
        compute_trial_days_remaining(now + timedelta(days=7), now=now + timedelta(seconds=1))
        == 7
    )
    assert (
        compute_trial_days_remaining(now + timedelta(days=7), now=now + timedelta(hours=1))
        == 7
    )
    # Between 6 and 7 full days remaining → still 7 with ceiling.
    assert (
        compute_trial_days_remaining(
            now + timedelta(days=7), now=now + timedelta(days=0, hours=12)
        )
        == 7
    )
    # Just over 6 days elapsed → 1 day of the 7th left in ceiling sense: 7-6=1 day? 
    # ends = now+7d, current = now+6d+1s → remaining ≈ 23h59m → ceil = 1
    assert (
        compute_trial_days_remaining(
            now + timedelta(days=7), now=now + timedelta(days=6, seconds=1)
        )
        == 1
    )
    # Under 24h remaining → 1
    assert compute_trial_days_remaining(now + timedelta(hours=3), now=now) == 1
    # Expired → 0
    assert compute_trial_days_remaining(now - timedelta(seconds=1), now=now) == 0
    # Exact boundary still open → 1
    assert compute_trial_days_remaining(now, now=now) == 1
