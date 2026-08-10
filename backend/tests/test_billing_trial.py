"""Trial created on register + entitlement access during trial."""

from __future__ import annotations

from sqlalchemy import select

from app.billing.entitlement import SubscriptionEntitlementService
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
        __import__("uuid").UUID(org_id),
        persist_lazy_transitions=False,
    )
    assert snap.has_active_access is True
    assert snap.can_write is True
    assert snap.subscription_status == "trial"
    assert snap.payment_status == "none"
    assert snap.trial_days_remaining is not None
    assert snap.trial_days_remaining >= 0

    api = client.get("/api/v1/billing/entitlement")
    assert api.status_code == 200
    body = api.json()
    assert body["has_active_access"] is True
    assert body["subscription_status"] == "trial"
