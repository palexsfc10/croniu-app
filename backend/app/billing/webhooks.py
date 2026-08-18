"""Asaas webhook processing — idempotent, sanitized, transactional."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.billing.asaas import AsaasBillingProvider, build_asaas_provider
from app.billing.entitlement import default_grace_period_end, is_trial_window_open
from app.models.billing import (
    BillingCheckout,
    BillingCheckoutStatus,
    BillingWebhookEvent,
    Subscription,
    SubscriptionStatus,
    WebhookProcessingStatus,
)

logger = logging.getLogger(__name__)

CHECKOUT_EVENTS = frozenset(
    {
        "CHECKOUT_CREATED",
        "CHECKOUT_CANCELED",
        "CHECKOUT_EXPIRED",
        "CHECKOUT_PAID",
    }
)

CHECKOUT_TERMINAL_STATUSES = frozenset(
    {
        BillingCheckoutStatus.PAID.value,
        BillingCheckoutStatus.CANCELED.value,
        BillingCheckoutStatus.EXPIRED.value,
        BillingCheckoutStatus.FAILED.value,
    }
)


class BillingWebhookService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def handle_asaas(
        self,
        *,
        payload: dict[str, Any],
        access_token: str | None,
    ) -> dict[str, Any]:
        provider = build_asaas_provider()
        parsed = provider.parse_and_validate_webhook(
            payload=payload,
            access_token=access_token,
        )

        digest = hashlib.sha256(
            json.dumps(parsed.sanitized_payload, sort_keys=True, default=str).encode()
        ).hexdigest()

        event = BillingWebhookEvent(
            id=uuid.uuid4(),
            provider="asaas",
            external_event_id=parsed.external_event_id,
            event_type=parsed.event_type,
            processing_status=WebhookProcessingStatus.RECEIVED.value,
            attempts=0,
            payload_digest=digest,
            payload_sanitized=parsed.sanitized_payload,
        )
        self.db.add(event)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            logger.info(
                "billing_webhook_duplicate external_event_id=%s",
                parsed.external_event_id,
            )
            return {
                "status": "duplicate",
                "external_event_id": parsed.external_event_id,
            }

        event.attempts = 1
        event.processing_status = WebhookProcessingStatus.PROCESSING.value
        self.db.flush()

        try:
            event_upper = parsed.event_type.upper()
            if event_upper in CHECKOUT_EVENTS:
                checkout = self._resolve_checkout(parsed)
                if checkout is not None:
                    event.organization_id = checkout.organization_id
                    event.subscription_id = checkout.subscription_id
                    self._apply_checkout_event(checkout, parsed)
                    subscription = self.db.get(Subscription, checkout.subscription_id)
                    if subscription is not None:
                        self._sync_subscription_from_checkout(
                            subscription, checkout, parsed
                        )
                        self.db.add(subscription)
                else:
                    event.processing_status = WebhookProcessingStatus.IGNORED.value
                    event.last_error = "checkout_not_resolved"
                    logger.info(
                        "billing_webhook_checkout_unresolved event_type=%s",
                        parsed.event_type,
                    )
            else:
                subscription = self._resolve_subscription(parsed, provider)
                if subscription is not None:
                    event.organization_id = subscription.organization_id
                    event.subscription_id = subscription.id
                    self._apply_event(subscription, parsed, provider)
                    self._link_checkout_subscription_ids(subscription, parsed)
                    self.db.add(subscription)
                else:
                    event.processing_status = WebhookProcessingStatus.IGNORED.value
                    event.last_error = "subscription_not_resolved"
                    logger.info(
                        "billing_webhook_unresolved event_type=%s",
                        parsed.event_type,
                    )

            if event.processing_status != WebhookProcessingStatus.IGNORED.value:
                event.processing_status = WebhookProcessingStatus.PROCESSED.value
            event.processed_at = datetime.now(UTC)
            self.db.commit()
            return {
                "status": event.processing_status,
                "external_event_id": parsed.external_event_id,
            }
        except Exception as exc:  # noqa: BLE001
            self.db.rollback()
            existing = self.db.scalar(
                select(BillingWebhookEvent).where(
                    BillingWebhookEvent.provider == "asaas",
                    BillingWebhookEvent.external_event_id == parsed.external_event_id,
                )
            )
            if existing is not None:
                existing.processing_status = WebhookProcessingStatus.FAILED.value
                existing.last_error = str(exc)[:2000]
                existing.attempts = (existing.attempts or 0) + 1
                self.db.commit()
            logger.exception(
                "billing_webhook_failed external_event_id=%s",
                parsed.external_event_id,
            )
            raise

    def _resolve_checkout(self, parsed: Any) -> BillingCheckout | None:
        if parsed.provider_checkout_id:
            found = self.db.scalar(
                select(BillingCheckout).where(
                    BillingCheckout.provider == "asaas",
                    BillingCheckout.provider_checkout_id == parsed.provider_checkout_id,
                )
            )
            if found is not None:
                return found

        if parsed.external_reference:
            found = self.db.scalar(
                select(BillingCheckout).where(
                    BillingCheckout.external_reference == parsed.external_reference
                )
            )
            if found is not None:
                return found
        return None

    def _resolve_subscription(
        self,
        parsed: Any,
        provider: AsaasBillingProvider,
    ) -> Subscription | None:
        _ = provider
        if parsed.provider_subscription_id:
            found = self.db.scalar(
                select(Subscription).where(
                    Subscription.provider == "asaas",
                    Subscription.provider_subscription_id
                    == parsed.provider_subscription_id,
                )
            )
            if found is not None:
                return found

            checkout = self.db.scalar(
                select(BillingCheckout).where(
                    BillingCheckout.provider == "asaas",
                    BillingCheckout.provider_subscription_id
                    == parsed.provider_subscription_id,
                )
            )
            if checkout is not None:
                return self.db.get(Subscription, checkout.subscription_id)

        if parsed.provider_checkout_id:
            checkout = self.db.scalar(
                select(BillingCheckout).where(
                    BillingCheckout.provider == "asaas",
                    BillingCheckout.provider_checkout_id == parsed.provider_checkout_id,
                )
            )
            if checkout is not None:
                return self.db.get(Subscription, checkout.subscription_id)

        if parsed.external_reference:
            checkout = self.db.scalar(
                select(BillingCheckout).where(
                    BillingCheckout.external_reference == parsed.external_reference
                )
            )
            if checkout is not None:
                return self.db.get(Subscription, checkout.subscription_id)
            try:
                sub_id = uuid.UUID(str(parsed.external_reference))
            except ValueError:
                sub_id = None
            if sub_id is not None:
                found = self.db.get(Subscription, sub_id)
                if found is not None:
                    return found

        if parsed.provider_customer_id:
            matches = list(
                self.db.scalars(
                    select(Subscription).where(
                        Subscription.provider == "asaas",
                        Subscription.provider_customer_id == parsed.provider_customer_id,
                    )
                ).all()
            )
            if len(matches) == 1:
                return matches[0]
        return None

    def _apply_checkout_event(self, checkout: BillingCheckout, parsed: Any) -> None:
        now = datetime.now(UTC)
        event = parsed.event_type.upper()
        current = (checkout.status or "").upper()

        if parsed.checkout_link and not checkout.checkout_url:
            checkout.checkout_url = parsed.checkout_link
        if parsed.provider_customer_id and not checkout.provider_customer_id:
            checkout.provider_customer_id = parsed.provider_customer_id
        if parsed.provider_subscription_id:
            checkout.provider_subscription_id = parsed.provider_subscription_id

        if event == "CHECKOUT_CREATED":
            if current in CHECKOUT_TERMINAL_STATUSES:
                return
            checkout.status = BillingCheckoutStatus.ACTIVE.value
            return

        if event == "CHECKOUT_CANCELED":
            if current in {
                BillingCheckoutStatus.PAID.value,
                BillingCheckoutStatus.CANCELED.value,
            }:
                return
            checkout.status = BillingCheckoutStatus.CANCELED.value
            checkout.canceled_at = checkout.canceled_at or now
            return

        if event == "CHECKOUT_EXPIRED":
            if current in {
                BillingCheckoutStatus.PAID.value,
                BillingCheckoutStatus.EXPIRED.value,
                BillingCheckoutStatus.CANCELED.value,
            }:
                return
            checkout.status = BillingCheckoutStatus.EXPIRED.value
            checkout.expired_at = checkout.expired_at or now
            return

        if event == "CHECKOUT_PAID":
            checkout.status = BillingCheckoutStatus.PAID.value
            checkout.paid_at = checkout.paid_at or now

    def _sync_subscription_from_checkout(
        self,
        subscription: Subscription,
        checkout: BillingCheckout,
        parsed: Any,
    ) -> None:
        now = datetime.now(UTC)
        if checkout.provider_checkout_id:
            subscription.provider_checkout_id = checkout.provider_checkout_id
        if checkout.provider_customer_id and not subscription.provider_customer_id:
            subscription.provider_customer_id = checkout.provider_customer_id
        if checkout.provider_subscription_id:
            existing = subscription.provider_subscription_id
            if not existing or existing != checkout.provider_subscription_id:
                subscription.provider_subscription_id = checkout.provider_subscription_id

        event = parsed.event_type.upper()
        if event == "CHECKOUT_PAID":
            if not subscription.payment_status or subscription.payment_status in {
                "none",
                "scheduled",
            }:
                subscription.payment_status = "pending"
            subscription.provider_synced_at = now
            if is_trial_window_open(subscription, now=now):
                subscription.status = SubscriptionStatus.TRIAL.value
            elif subscription.status == SubscriptionStatus.EXPIRED.value:
                subscription.status = SubscriptionStatus.PENDING_ACTIVATION.value
        elif event in {"CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"}:
            if subscription.provider_checkout_id == checkout.provider_checkout_id:
                subscription.provider_checkout_id = None
            subscription.provider_synced_at = now

    def _link_checkout_subscription_ids(
        self, subscription: Subscription, parsed: Any
    ) -> None:
        if not parsed.provider_subscription_id:
            return
        stmt = select(BillingCheckout).where(
            BillingCheckout.subscription_id == subscription.id,
            BillingCheckout.status.in_(
                (
                    BillingCheckoutStatus.ACTIVE.value,
                    BillingCheckoutStatus.PAID.value,
                    BillingCheckoutStatus.PENDING.value,
                )
            ),
        )
        for checkout in self.db.scalars(stmt).all():
            checkout.provider_subscription_id = parsed.provider_subscription_id
            if parsed.provider_customer_id and not checkout.provider_customer_id:
                checkout.provider_customer_id = parsed.provider_customer_id

    def _apply_event(
        self,
        subscription: Subscription,
        parsed: Any,
        provider: AsaasBillingProvider,
    ) -> None:
        now = datetime.now(UTC)
        event = parsed.event_type.upper()
        mapped = provider.map_provider_status(
            provider_payment_status=parsed.payment_status,
            event_type=event,
        )
        trial_open = is_trial_window_open(subscription, now=now)
        subscription.provider_synced_at = now

        event_sub_id = parsed.provider_subscription_id
        current_id = subscription.provider_subscription_id

        if event == "SUBSCRIPTION_DELETED" and event_sub_id:
            if current_id and str(event_sub_id) != str(current_id):
                return
            subscription.payment_status = "cancelled"
            subscription.cancelled_at = subscription.cancelled_at or now
            if trial_open:
                subscription.status = SubscriptionStatus.TRIAL.value
            else:
                subscription.status = SubscriptionStatus.CANCELLED.value
                subscription.cancellation_effective_at = (
                    subscription.current_period_end or now
                )
            return

        if event == "SUBSCRIPTION_INACTIVATED":
            logger.info("billing_webhook_subscription_inactivated_no_permanent_cancel")
            return

        if not event_sub_id:
            logger.info(
                "billing_webhook_missing_subscription_identity event_type=%s",
                event,
            )
            return

        event_sub_id = str(event_sub_id)
        if current_id and event_sub_id != str(current_id):
            return

        if parsed.provider_subscription_id and not subscription.provider_subscription_id:
            subscription.provider_subscription_id = str(parsed.provider_subscription_id)

        if parsed.provider_customer_id and not subscription.provider_customer_id:
            subscription.provider_customer_id = parsed.provider_customer_id

        if event in {"PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"}:
            subscription.payment_status = "confirmed"
            if trial_open:
                subscription.status = SubscriptionStatus.TRIAL.value
                subscription.next_billing_at = subscription.trial_ends_at
            else:
                subscription.status = SubscriptionStatus.ACTIVE.value
                subscription.current_period_start = now
                subscription.current_period_end = now + timedelta(days=30)
                subscription.next_billing_at = subscription.current_period_end
                subscription.grace_period_ends_at = None

            from app.services.referral import mark_referral_paid

            mark_referral_paid(self.db, subscription.organization_id)
            return

        if event == "PAYMENT_OVERDUE":
            subscription.payment_status = "overdue"
            if trial_open:
                subscription.status = SubscriptionStatus.TRIAL.value
            else:
                subscription.status = SubscriptionStatus.PAST_DUE.value
                if subscription.grace_period_ends_at is None:
                    subscription.grace_period_ends_at = default_grace_period_end(now)
            return

        if event in {"PAYMENT_CREATED", "PAYMENT_UPDATED"}:
            if parsed.payment_status and parsed.payment_status.upper() in {
                "PENDING",
                "AWAITING_PAYMENT",
            }:
                subscription.payment_status = "pending"
                if (
                    not trial_open
                    and subscription.status != SubscriptionStatus.ACTIVE.value
                ):
                    subscription.status = SubscriptionStatus.PAYMENT_PENDING.value
            return

        if event == "PAYMENT_DELETED":
            return

        if event == "PAYMENT_REFUNDED":
            subscription.payment_status = "refunded"
            subscription.status = SubscriptionStatus.PROVIDER_ERROR.value
            return

        if mapped == SubscriptionStatus.ACTIVE.value and not trial_open:
            subscription.status = SubscriptionStatus.ACTIVE.value
        elif mapped == SubscriptionStatus.PAST_DUE.value and not trial_open:
            subscription.status = SubscriptionStatus.PAST_DUE.value
            if subscription.grace_period_ends_at is None:
                subscription.grace_period_ends_at = default_grace_period_end(now)
