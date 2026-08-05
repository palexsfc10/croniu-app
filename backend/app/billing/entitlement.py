"""Centralized subscription entitlement (single source of truth for access)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.billing.config import get_billing_runtime_status, is_checkout_allowed_for_org
from app.config import get_settings
from app.models.billing import BillingPlan, BillingPrice, Subscription, SubscriptionStatus
from app.models.organization import Organization
from app.services.auth import AuthError


WRITE_ALLOWED_STATUSES = frozenset(
    {
        SubscriptionStatus.TRIAL.value,
        SubscriptionStatus.PENDING_PAYMENT_METHOD.value,
        SubscriptionStatus.PENDING_ACTIVATION.value,
        SubscriptionStatus.ACTIVE.value,
        SubscriptionStatus.PAYMENT_PENDING.value,
        SubscriptionStatus.PAST_DUE.value,
        SubscriptionStatus.GRACE_PERIOD.value,
        SubscriptionStatus.CANCELLED.value,
    }
)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _iso(dt: datetime | None) -> str | None:
    aware = _aware(dt)
    return aware.isoformat() if aware else None


def compute_trial_days_remaining(
    trial_ends_at: datetime | None,
    *,
    now: datetime | None = None,
) -> int | None:
    ends = _aware(trial_ends_at)
    if ends is None:
        return None
    current = now or datetime.now(UTC)
    if ends < current:
        return 0
    delta = ends - current
    return max(0, delta.days)


def is_trial_window_open(
    subscription: Subscription,
    *,
    now: datetime | None = None,
) -> bool:
    ends = _aware(subscription.trial_ends_at)
    if ends is None:
        return False
    current = now or datetime.now(UTC)
    return ends >= current


def default_grace_period_end(now: datetime | None = None) -> datetime:
    current = now or datetime.now(UTC)
    return current + timedelta(days=get_settings().billing_grace_period_days)


@dataclass(frozen=True)
class EntitlementSnapshot:
    subscription_status: str
    payment_status: str | None
    trial_started_at: str | None
    trial_ends_at: str | None
    trial_days_remaining: int | None
    trial_days_total: int
    has_active_access: bool
    can_read: bool
    can_write: bool
    requires_payment_action: bool
    grace_period_ends_at: str | None
    blocking_reason: str | None
    recommended_action: str | None
    provider: str | None
    plan_code: str | None
    plan_name: str | None
    next_billing_at: str | None
    country_code: str | None
    currency: str | None
    amount_cents: int | None
    billing_type: str | None
    payment_prepared: bool
    gateway_available: bool
    checkout_available: bool = False
    sandbox_mode: bool = True
    card_enabled: bool = False
    billing_homologation: bool = False
    cancel_scheduled: bool = False
    cancellation_effective_at: str | None = None
    open_cancellation_request_id: str | None = None
    billing_setup_status: str = "available"
    can_resume_checkout: bool = False
    can_start_checkout: bool = False
    can_cancel_subscription: bool = False
    resume_checkout_url: str | None = None
    open_checkout_expires_at: str | None = None
    open_checkout_status: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SubscriptionEntitlementService:
    """Single access-policy engine for banner, gates, and billing UX."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_subscription(self, organization_id: uuid.UUID) -> Subscription | None:
        return self.db.scalar(
            select(Subscription).where(Subscription.organization_id == organization_id)
        )

    def get_for_organization(
        self,
        organization_id: uuid.UUID,
        *,
        now: datetime | None = None,
        persist_lazy_transitions: bool = True,
    ) -> EntitlementSnapshot:
        organization = self.db.get(Organization, organization_id)
        subscription = self.get_subscription(organization_id)
        return self.build_snapshot(
            subscription,
            organization,
            now=now,
            persist_lazy_transitions=persist_lazy_transitions,
        )

    def build_snapshot(
        self,
        subscription: Subscription | None,
        organization: Organization | None = None,
        *,
        now: datetime | None = None,
        persist_lazy_transitions: bool = True,
    ) -> EntitlementSnapshot:
        settings = get_settings()
        current = now or datetime.now(UTC)
        if subscription is None:
            return self._empty_snapshot(organization)

        if persist_lazy_transitions:
            self._apply_lazy_transitions(subscription, current)

        plan = None
        price = None
        if subscription.plan_id:
            plan = self.db.get(BillingPlan, subscription.plan_id)
        if subscription.price_id:
            price = self.db.get(BillingPrice, subscription.price_id)

        trial_open = is_trial_window_open(subscription, now=current)
        days_remaining = compute_trial_days_remaining(
            subscription.trial_ends_at, now=current
        )
        can_write, blocking_reason, recommended_action, requires_payment = (
            self._evaluate_access(subscription, trial_open=trial_open, now=current)
        )
        gateway_available = self._gateway_available(subscription)
        runtime = get_billing_runtime_status()
        org_id = subscription.organization_id
        checkout_available = bool(
            gateway_available
            and org_id is not None
            and is_checkout_allowed_for_org(org_id)
        )

        from app.billing.setup_status import (
            expire_open_checkout_if_needed,
            get_latest_checkout,
            get_open_checkout,
            resolve_billing_setup,
        )

        open_checkout = get_open_checkout(self.db, subscription.organization_id)
        prior_status = getattr(open_checkout, "status", None) if open_checkout else None
        open_checkout = expire_open_checkout_if_needed(
            self.db,
            open_checkout,
            subscription,
            now=current,
        )
        if (
            persist_lazy_transitions
            and open_checkout is not None
            and prior_status is not None
            and getattr(open_checkout, "status", None) != prior_status
        ):
            self.db.commit()

        latest_checkout = open_checkout
        if latest_checkout is None:
            latest_checkout = get_latest_checkout(self.db, subscription.organization_id)

        setup = resolve_billing_setup(
            subscription,
            latest_checkout,
            gateway_checkout_available=checkout_available,
            open_cancellation=False,
            cancel_scheduled=False,
        )

        return EntitlementSnapshot(
            subscription_status=self._public_status(subscription),
            payment_status=subscription.payment_status,
            trial_started_at=_iso(subscription.trial_started_at or subscription.started_at),
            trial_ends_at=_iso(subscription.trial_ends_at),
            trial_days_remaining=days_remaining,
            trial_days_total=settings.trial_days,
            has_active_access=can_write,
            can_read=True,
            can_write=can_write,
            requires_payment_action=requires_payment,
            grace_period_ends_at=_iso(subscription.grace_period_ends_at),
            blocking_reason=blocking_reason,
            recommended_action=recommended_action,
            provider=subscription.provider,
            plan_code=(plan.code if plan else subscription.plan_code),
            plan_name=(plan.name if plan else None),
            next_billing_at=_iso(subscription.next_billing_at),
            country_code=subscription.country_code or "BR",
            currency=subscription.currency or "BRL",
            amount_cents=price.amount_cents if price else None,
            billing_type=subscription.billing_type,
            payment_prepared=setup.payment_prepared,
            gateway_available=gateway_available,
            checkout_available=checkout_available,
            sandbox_mode=runtime.sandbox_mode,
            card_enabled=runtime.card_enabled,
            billing_homologation=runtime.sandbox_mode and settings.is_production_like,
            cancel_scheduled=False,
            cancellation_effective_at=_iso(subscription.cancellation_effective_at),
            open_cancellation_request_id=None,
            billing_setup_status=setup.billing_setup_status.value,
            can_resume_checkout=setup.can_resume_checkout,
            can_start_checkout=setup.can_start_checkout,
            can_cancel_subscription=setup.can_cancel_subscription,
            resume_checkout_url=setup.resume_checkout_url,
            open_checkout_expires_at=setup.open_checkout_expires_at,
            open_checkout_status=setup.open_checkout_status,
        )

    def ensure_can_write(self, organization_id: uuid.UUID) -> EntitlementSnapshot:
        snap = self.get_for_organization(organization_id)
        if snap.can_write:
            return snap

        code = snap.blocking_reason or "trial_expired"
        messages = {
            "trial_expired": (
                "O período de teste encerrou. Seus dados estão preservados; "
                "assine para continuar editando."
            ),
            "payment_past_due": (
                "Há uma cobrança pendente. Atualize o pagamento para continuar."
            ),
            "subscription_suspended": (
                "A assinatura está suspensa. Regularize o pagamento para continuar."
            ),
            "subscription_required": (
                "É necessário ter uma assinatura ativa para continuar."
            ),
        }
        raise AuthError(
            code,
            messages.get(code, messages["trial_expired"]),
            status_code=403,
        )

    def _apply_lazy_transitions(self, subscription: Subscription, now: datetime) -> None:
        changed = False
        trial_open = is_trial_window_open(subscription, now=now)
        has_provider_sub = bool(subscription.provider_subscription_id)
        status = subscription.status

        if (
            status
            in {
                SubscriptionStatus.TRIAL.value,
                SubscriptionStatus.PENDING_PAYMENT_METHOD.value,
            }
            and not trial_open
            and not has_provider_sub
        ):
            subscription.status = SubscriptionStatus.EXPIRED.value
            changed = True

        if (
            status == SubscriptionStatus.TRIAL.value
            and not trial_open
            and has_provider_sub
            and subscription.payment_status in {None, "scheduled", "pending"}
        ):
            subscription.status = SubscriptionStatus.PENDING_ACTIVATION.value
            changed = True

        grace_end = _aware(subscription.grace_period_ends_at)
        if (
            status in {SubscriptionStatus.PAST_DUE.value, SubscriptionStatus.GRACE_PERIOD.value}
            and grace_end is not None
            and grace_end < now
        ):
            subscription.status = SubscriptionStatus.EXPIRED.value
            changed = True

        effective = _aware(subscription.cancellation_effective_at)
        if (
            status == SubscriptionStatus.CANCELLED.value
            and effective is not None
            and effective < now
        ):
            subscription.status = SubscriptionStatus.EXPIRED.value
            changed = True

        if changed:
            self.db.add(subscription)
            self.db.flush()
            self.db.commit()

    def _evaluate_access(
        self,
        subscription: Subscription,
        *,
        trial_open: bool,
        now: datetime,
    ) -> tuple[bool, str | None, str | None, bool]:
        status = subscription.status

        if status == SubscriptionStatus.ACTIVE.value:
            return True, None, None, False

        if status == SubscriptionStatus.PAYMENT_PENDING.value:
            return True, None, "await_payment_confirmation", True

        if status == SubscriptionStatus.PENDING_ACTIVATION.value:
            if trial_open:
                return True, None, "await_first_charge", False
            return True, None, "await_payment_confirmation", True

        if status in {
            SubscriptionStatus.TRIAL.value,
            SubscriptionStatus.PENDING_PAYMENT_METHOD.value,
        }:
            if trial_open:
                action = None if subscription.provider_subscription_id else "subscribe"
                return True, None, action, False
            return False, "trial_expired", "subscribe", True

        if status in {SubscriptionStatus.PAST_DUE.value, SubscriptionStatus.GRACE_PERIOD.value}:
            grace_end = _aware(subscription.grace_period_ends_at)
            if grace_end is None or grace_end >= now:
                return True, None, "update_payment_method", True
            return False, "payment_past_due", "update_payment_method", True

        if status == SubscriptionStatus.CANCELLED.value:
            effective = _aware(subscription.cancellation_effective_at)
            if effective is None or effective >= now:
                return True, None, None, False
            return False, "subscription_required", "subscribe", True

        if status == SubscriptionStatus.SUSPENDED.value:
            return False, "subscription_suspended", "contact_support", True

        if status == SubscriptionStatus.EXPIRED.value:
            return False, "trial_expired", "subscribe", True

        if status in {
            SubscriptionStatus.INCOMPLETE.value,
            SubscriptionStatus.PROVIDER_ERROR.value,
        }:
            return False, "subscription_required", "contact_support", True

        if status in WRITE_ALLOWED_STATUSES:
            return True, None, None, False

        return False, "subscription_required", "subscribe", True

    def _public_status(self, subscription: Subscription) -> str:
        if subscription.status == SubscriptionStatus.EXPIRED.value:
            return "trial_expired"
        if subscription.status == SubscriptionStatus.TRIAL.value:
            return "trial"
        return subscription.status

    def _gateway_available(self, subscription: Subscription) -> bool:
        country = (subscription.country_code or "").upper()
        currency = (subscription.currency or "").upper()
        if not country and not currency:
            return True
        if not country:
            country = "BR"
        if not currency:
            currency = "BRL"
        return country == "BR" and currency == "BRL"

    def _empty_snapshot(self, organization: Organization | None) -> EntitlementSnapshot:
        runtime = get_billing_runtime_status()
        settings = get_settings()
        return EntitlementSnapshot(
            subscription_status="missing",
            payment_status=None,
            trial_started_at=None,
            trial_ends_at=None,
            trial_days_remaining=None,
            trial_days_total=settings.trial_days,
            has_active_access=False,
            can_read=True,
            can_write=False,
            requires_payment_action=True,
            grace_period_ends_at=None,
            blocking_reason="subscription_required",
            recommended_action="subscribe",
            provider=None,
            plan_code=None,
            plan_name=None,
            next_billing_at=None,
            country_code="BR",
            currency="BRL",
            amount_cents=None,
            billing_type=None,
            payment_prepared=False,
            gateway_available=False,
            checkout_available=False,
            sandbox_mode=runtime.sandbox_mode,
            card_enabled=runtime.card_enabled,
            billing_homologation=runtime.sandbox_mode and settings.is_production_like,
            cancel_scheduled=False,
            cancellation_effective_at=None,
            open_cancellation_request_id=None,
            billing_setup_status="available",
            can_resume_checkout=False,
            can_start_checkout=False,
            can_cancel_subscription=False,
            resume_checkout_url=None,
            open_checkout_expires_at=None,
            open_checkout_status=None,
        )
