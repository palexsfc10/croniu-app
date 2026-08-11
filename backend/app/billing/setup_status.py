"""Billing setup presentation — discriminate checkout vs subscription vs paid.

Never treat provider_checkout_id alone as payment_prepared / contracted.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.billing.checkout_helpers import is_allowed_asaas_checkout_link
from app.models.billing import (
    BillingCheckout,
    BillingCheckoutStatus,
    Subscription,
    SubscriptionStatus,
)

__all__ = [
    "BillingCheckout",
    "BillingSetupStatus",
    "BillingSetupPresentation",
    "expire_open_checkout_if_needed",
    "get_latest_checkout",
    "get_open_checkout",
    "resolve_billing_setup",
    "sanitize_resume_checkout_url",
]


OPEN_CHECKOUT_STATUSES = frozenset(
    {
        BillingCheckoutStatus.PENDING.value,
        BillingCheckoutStatus.ACTIVE.value,
    }
)

TERMINAL_UNPAID_STATUSES = frozenset(
    {
        BillingCheckoutStatus.EXPIRED.value,
        BillingCheckoutStatus.FAILED.value,
        BillingCheckoutStatus.CANCELED.value,
    }
)

PAID_PAYMENT_STATUSES = frozenset({"confirmed", "received", "paid"})


class BillingSetupStatus(StrEnum):
    AVAILABLE = "available"
    CHECKOUT_PENDING = "checkout_pending"
    SUBSCRIPTION_PREPARED = "subscription_prepared"
    PAID = "paid"
    CHECKOUT_FAILED = "checkout_failed"
    CHECKOUT_EXPIRED = "checkout_expired"


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _iso(dt: datetime | None) -> str | None:
    aware = _aware(dt)
    return aware.isoformat() if aware else None


def sanitize_resume_checkout_url(url: str | None) -> str | None:
    """Return checkout URL only when allowlisted for the current Asaas environment."""
    if not url or not str(url).strip():
        return None
    if not is_allowed_asaas_checkout_link(str(url).strip()):
        return None
    return str(url).strip()


def get_open_checkout(db: Session, organization_id: Any) -> BillingCheckout | None:
    stmt = (
        select(BillingCheckout)
        .where(
            BillingCheckout.organization_id == organization_id,
            BillingCheckout.status.in_(tuple(OPEN_CHECKOUT_STATUSES)),
        )
        .order_by(BillingCheckout.created_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def get_latest_checkout(db: Session, organization_id: Any) -> BillingCheckout | None:
    stmt = (
        select(BillingCheckout)
        .where(BillingCheckout.organization_id == organization_id)
        .order_by(BillingCheckout.created_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def expire_open_checkout_if_needed(
    db: Session,
    checkout: Any | None,
    subscription: Subscription | None,
    *,
    now: datetime | None = None,
) -> Any | None:
    """Mark local open checkout EXPIRED when past expires_at; clear stuck pointer.

    Does not call the provider. Browser back alone never expires a checkout.
    """
    if checkout is None:
        return None
    current = now or datetime.now(UTC)
    expires = _aware(checkout.expires_at)
    if (
        checkout.status in OPEN_CHECKOUT_STATUSES
        and expires is not None
        and expires <= current
    ):
        checkout.status = BillingCheckoutStatus.EXPIRED.value
        checkout.expired_at = checkout.expired_at or current
        if (
            subscription is not None
            and subscription.provider_checkout_id
            and checkout.provider_checkout_id
            and subscription.provider_checkout_id == checkout.provider_checkout_id
            and not subscription.provider_subscription_id
        ):
            subscription.provider_checkout_id = None
        db.flush()
    return checkout


@dataclass(frozen=True)
class BillingSetupPresentation:
    billing_setup_status: BillingSetupStatus
    payment_prepared: bool
    can_resume_checkout: bool
    can_start_checkout: bool
    can_cancel_subscription: bool
    resume_checkout_url: str | None
    open_checkout_expires_at: str | None
    open_checkout_status: str | None

    def as_entitlement_fields(self) -> dict[str, Any]:
        return {
            "billing_setup_status": self.billing_setup_status.value,
            "payment_prepared": self.payment_prepared,
            "can_resume_checkout": self.can_resume_checkout,
            "can_start_checkout": self.can_start_checkout,
            "can_cancel_subscription": self.can_cancel_subscription,
            "resume_checkout_url": self.resume_checkout_url,
            "open_checkout_expires_at": self.open_checkout_expires_at,
            "open_checkout_status": self.open_checkout_status,
        }


def _status_value(status: Any) -> str:
    if isinstance(status, SubscriptionStatus):
        return status.value
    return str(status or "")


def resolve_billing_setup(
    subscription: Subscription | None,
    checkout: Any | None,
    *,
    gateway_checkout_available: bool,
    open_cancellation: bool = False,
    cancel_scheduled: bool = False,
) -> BillingSetupPresentation:
    """Derive UX/API setup state. Checkout id alone never means prepared/paid."""
    empty = BillingSetupPresentation(
        billing_setup_status=BillingSetupStatus.AVAILABLE,
        payment_prepared=False,
        can_resume_checkout=False,
        can_start_checkout=False,
        can_cancel_subscription=False,
        resume_checkout_url=None,
        open_checkout_expires_at=None,
        open_checkout_status=None,
    )
    if subscription is None:
        return empty

    has_provider_sub = bool(
        (getattr(subscription, "provider_subscription_id", None) or "").strip()
    )
    payment_status = (getattr(subscription, "payment_status", None) or "").lower()
    status = _status_value(subscription.status)

    # D — paid / confirmed
    if status == SubscriptionStatus.ACTIVE.value or payment_status in PAID_PAYMENT_STATUSES:
        can_cancel = (
            has_provider_sub
            and not cancel_scheduled
            and status
            in {
                SubscriptionStatus.ACTIVE.value,
                SubscriptionStatus.TRIAL.value,
                SubscriptionStatus.PENDING_ACTIVATION.value,
                SubscriptionStatus.PAYMENT_PENDING.value,
            }
        )
        return BillingSetupPresentation(
            billing_setup_status=BillingSetupStatus.PAID,
            payment_prepared=False,
            can_resume_checkout=False,
            can_start_checkout=False,
            can_cancel_subscription=can_cancel
            or (open_cancellation and has_provider_sub),
            resume_checkout_url=None,
            open_checkout_expires_at=None,
            open_checkout_status=None,
        )

    # C — remote subscription exists (trial / awaiting first charge)
    if has_provider_sub and status in {
        SubscriptionStatus.TRIAL.value,
        SubscriptionStatus.PENDING_ACTIVATION.value,
        SubscriptionStatus.PAYMENT_PENDING.value,
        SubscriptionStatus.PENDING_PAYMENT_METHOD.value,
    }:
        can_cancel = not cancel_scheduled and (
            open_cancellation
            or status
            in {
                SubscriptionStatus.TRIAL.value,
                SubscriptionStatus.PENDING_ACTIVATION.value,
                SubscriptionStatus.PAYMENT_PENDING.value,
                SubscriptionStatus.ACTIVE.value,
            }
        )
        return BillingSetupPresentation(
            billing_setup_status=BillingSetupStatus.SUBSCRIPTION_PREPARED,
            payment_prepared=True,
            can_resume_checkout=False,
            can_start_checkout=False,
            can_cancel_subscription=can_cancel,
            resume_checkout_url=None,
            open_checkout_expires_at=None,
            open_checkout_status=None,
        )

    # B — open unpaid hosted checkout
    if (
        checkout is not None
        and checkout.status in OPEN_CHECKOUT_STATUSES
        and checkout.paid_at is None
    ):
        resume_url = sanitize_resume_checkout_url(checkout.checkout_url)
        return BillingSetupPresentation(
            billing_setup_status=BillingSetupStatus.CHECKOUT_PENDING,
            payment_prepared=False,
            can_resume_checkout=bool(resume_url),
            can_start_checkout=False,
            can_cancel_subscription=False,
            resume_checkout_url=resume_url,
            open_checkout_expires_at=_iso(checkout.expires_at),
            open_checkout_status=checkout.status,
        )

    # E — terminal unpaid checkout (new attempt allowed)
    if checkout is not None and checkout.status in TERMINAL_UNPAID_STATUSES:
        setup = (
            BillingSetupStatus.CHECKOUT_EXPIRED
            if checkout.status == BillingCheckoutStatus.EXPIRED.value
            else BillingSetupStatus.CHECKOUT_FAILED
        )
        can_start = bool(
            gateway_checkout_available
            and not open_cancellation
            and not cancel_scheduled
            and status != SubscriptionStatus.ACTIVE.value
        )
        return BillingSetupPresentation(
            billing_setup_status=setup,
            payment_prepared=False,
            can_resume_checkout=False,
            can_start_checkout=can_start,
            can_cancel_subscription=False,
            resume_checkout_url=None,
            open_checkout_expires_at=_iso(checkout.expires_at),
            open_checkout_status=checkout.status,
        )

    # A — available
    can_start = bool(
        gateway_checkout_available
        and not open_cancellation
        and not cancel_scheduled
        and status != SubscriptionStatus.ACTIVE.value
        and not has_provider_sub
    )
    if status in {
        SubscriptionStatus.EXPIRED.value,
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.SUSPENDED.value,
    }:
        can_start = bool(
            gateway_checkout_available
            and not open_cancellation
            and not cancel_scheduled
        )

    return BillingSetupPresentation(
        billing_setup_status=BillingSetupStatus.AVAILABLE,
        payment_prepared=False,
        can_resume_checkout=False,
        can_start_checkout=can_start,
        can_cancel_subscription=False,
        resume_checkout_url=None,
        open_checkout_expires_at=None,
        open_checkout_status=None,
    )
