"""Billing application service — trial, entitlement, hosted checkout."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.billing.asaas import build_asaas_provider
from app.billing.checkout_helpers import (
    billing_customer_to_asaas_fields,
    build_checkout_callback_urls,
    build_validated_billing_customer,
    cents_to_asaas_value,
    clamp_minutes_to_expire,
    compute_expires_at,
    first_charge_date_for_subscription,
)
from app.billing.config import get_billing_runtime_status, require_hosted_card_checkout_allowed
from app.billing.entitlement import SubscriptionEntitlementService, is_trial_window_open
from app.config import get_settings
from app.models.billing import (
    BillingCheckout,
    BillingCheckoutStatus,
    BillingPlan,
    BillingPrice,
    BillingProviderCode,
    Subscription,
    SubscriptionStatus,
)
from app.models.organization import Organization
from app.models.user import User
from app.services.auth import AuthError

logger = logging.getLogger(__name__)

OPEN_CHECKOUT_STATUSES = frozenset(
    {
        BillingCheckoutStatus.PENDING.value,
        BillingCheckoutStatus.ACTIVE.value,
    }
)

STARTER_PLAN_ID = uuid.UUID("b1000000-0000-4000-8000-000000000001")
STARTER_PRICE_ID = uuid.UUID("b1000000-0000-4000-8000-000000000002")


def ensure_billing_catalog(db: Session) -> tuple[BillingPlan, BillingPrice]:
    """Ensure starter plan + Asaas BRL monthly price exist (idempotent)."""
    settings = get_settings()
    plan = db.scalar(select(BillingPlan).where(BillingPlan.code == "starter"))
    if plan is None:
        plan = BillingPlan(
            id=STARTER_PLAN_ID,
            code="starter",
            name="Croniu Starter",
            description="Plano comercial padrão do Croniu",
            status="active",
        )
        db.add(plan)
        db.flush()

    price = db.scalar(
        select(BillingPrice).where(
            BillingPrice.plan_id == plan.id,
            BillingPrice.provider == "asaas",
            BillingPrice.country_code == "BR",
            BillingPrice.currency == "BRL",
            BillingPrice.billing_interval == "month",
            BillingPrice.active.is_(True),
        )
    )
    if price is None:
        price = BillingPrice(
            id=STARTER_PRICE_ID,
            plan_id=plan.id,
            provider="asaas",
            country_code="BR",
            currency="BRL",
            billing_interval="month",
            amount_cents=settings.billing_default_amount_cents,
            version=1,
            active=True,
        )
        db.add(price)
        db.flush()
    return plan, price


class BillingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.entitlements = SubscriptionEntitlementService(db)

    def get_entitlement(self, organization_id: uuid.UUID) -> dict[str, Any]:
        return self.entitlements.get_for_organization(organization_id).to_dict()

    def get_status(self, organization_id: uuid.UUID) -> dict[str, Any]:
        runtime = get_billing_runtime_status()
        entitlement = self.get_entitlement(organization_id)
        return {
            **runtime.to_public_dict(),
            "checkout_available": entitlement.get("checkout_available"),
            "organization_id": str(organization_id),
        }

    def create_trial(
        self,
        *,
        organization_id: uuid.UUID,
        plan_code: str = "starter",
        trial_days: int | None = None,
        country_code: str = "BR",
        currency: str = "BRL",
    ) -> Subscription:
        """Create local trial subscription with payment_status=none."""
        settings = get_settings()
        days = trial_days if trial_days is not None else settings.trial_days
        plan, price = ensure_billing_catalog(self.db)
        now = datetime.now(UTC)
        from datetime import timedelta

        subscription = Subscription(
            organization_id=organization_id,
            plan_code=plan_code or plan.code,
            plan_id=plan.id,
            price_id=price.id,
            status=SubscriptionStatus.TRIAL.value,
            started_at=now,
            trial_started_at=now,
            trial_ends_at=now + timedelta(days=days),
            country_code=country_code,
            currency=currency,
            payment_status="none",
            renewal_day=None,
        )
        self.db.add(subscription)
        self.db.flush()
        return subscription

    def create_hosted_checkout(
        self,
        *,
        organization_id: uuid.UUID,
        user: User,
        price_id: uuid.UUID | None = None,
        customer: dict[str, str],
        billing_method: str = "credit_card",
        remote_ip: str | None = None,
    ) -> dict[str, Any]:
        require_hosted_card_checkout_allowed(organization_id)
        method = (billing_method or "").strip().lower()
        if method != "credit_card":
            raise AuthError(
                "validation_error",
                "Método de pagamento inválido para checkout hospedado.",
                status_code=422,
            )

        billing_customer = build_validated_billing_customer(
            cpf_cnpj=customer.get("cpf_cnpj"),
            phone=customer.get("phone"),
            postal_code=customer.get("postal_code"),
            address=customer.get("address"),
            address_number=customer.get("address_number"),
            province=customer.get("province"),
            complement=customer.get("complement"),
        )
        asaas_customer_fields = billing_customer_to_asaas_fields(billing_customer)

        org = self.db.get(Organization, organization_id)
        if org is None:
            raise AuthError(
                "organization_not_found",
                "Organização não encontrada.",
                status_code=404,
            )

        subscription = self.db.scalar(
            select(Subscription)
            .where(Subscription.organization_id == organization_id)
            .with_for_update()
        )
        if subscription is None:
            raise AuthError(
                "validation_error",
                "Assinatura da organização não encontrada.",
                status_code=422,
            )

        if subscription.status == SubscriptionStatus.ACTIVE.value:
            raise AuthError(
                "validation_error",
                "A organização já possui assinatura ativa.",
                status_code=422,
            )

        now = datetime.now(UTC)
        existing = self._get_open_checkout(organization_id)
        if existing is not None:
            if existing.expires_at and existing.expires_at <= now:
                existing.status = BillingCheckoutStatus.EXPIRED.value
                existing.expired_at = existing.expired_at or now
                if (
                    subscription.provider_checkout_id
                    and existing.provider_checkout_id
                    and subscription.provider_checkout_id == existing.provider_checkout_id
                    and not subscription.provider_subscription_id
                ):
                    subscription.provider_checkout_id = None
                self.db.flush()
            elif (
                existing.status == BillingCheckoutStatus.ACTIVE.value
                and existing.checkout_url
                and existing.provider_checkout_id
            ):
                return self._checkout_public_view(existing)
            elif existing.status == BillingCheckoutStatus.PENDING.value:
                if existing.checkout_url and existing.provider_checkout_id:
                    return self._checkout_public_view(existing)
                raise AuthError(
                    "validation_error",
                    "Já existe um checkout em andamento. Aguarde e tente novamente.",
                    status_code=409,
                )

        settings = get_settings()
        plan, default_price = ensure_billing_catalog(self.db)
        price = self.db.get(BillingPrice, price_id) if price_id else default_price
        if (
            price is None
            or not price.active
            or price.provider != BillingProviderCode.ASAAS.value
            or price.country_code != "BR"
            or price.currency != "BRL"
            or price.billing_interval != "month"
        ):
            raise AuthError(
                "validation_error",
                "Preço inválido para o mercado desta organização.",
                status_code=422,
            )
        if price.amount_cents <= 0:
            raise AuthError(
                "billing_provider_error",
                "Preço do plano não configurado. Contate o suporte.",
                status_code=503,
            )

        plan = self.db.get(BillingPlan, price.plan_id) or plan
        provider = build_asaas_provider()

        customer_id = subscription.provider_customer_id
        if not customer_id:
            created = provider.create_customer(
                name=org.name,
                email=user.email,
                external_reference=str(organization_id),
                cpf_cnpj=asaas_customer_fields["cpfCnpj"],
                phone=asaas_customer_fields["phone"],
                postal_code=asaas_customer_fields["postalCode"],
                address=asaas_customer_fields["address"],
                address_number=asaas_customer_fields["addressNumber"],
                province=asaas_customer_fields["province"],
                complement=asaas_customer_fields.get("complement"),
            )
            customer_id = created.id
            subscription.provider_customer_id = customer_id
        else:
            provider.update_customer(
                customer_id,
                name=org.name,
                email=user.email,
                cpf_cnpj=asaas_customer_fields["cpfCnpj"],
                phone=asaas_customer_fields["phone"],
                postal_code=asaas_customer_fields["postalCode"],
                address=asaas_customer_fields["address"],
                address_number=asaas_customer_fields["addressNumber"],
                province=asaas_customer_fields["province"],
                complement=asaas_customer_fields.get("complement"),
            )

        first_charge = first_charge_date_for_subscription(subscription, now=now)
        minutes = clamp_minutes_to_expire(settings.billing_checkout_minutes_to_expire)
        callbacks = build_checkout_callback_urls()
        external_reference = f"crn_{uuid.uuid4().hex}"
        amount_cents = int(price.amount_cents)
        value = cents_to_asaas_value(amount_cents)

        checkout_row = BillingCheckout(
            id=uuid.uuid4(),
            organization_id=organization_id,
            subscription_id=subscription.id,
            price_id=price.id,
            provider=BillingProviderCode.ASAAS.value,
            provider_checkout_id=None,
            external_reference=external_reference,
            checkout_url=None,
            status=BillingCheckoutStatus.PENDING.value,
            amount_cents=amount_cents,
            currency="BRL",
            billing_type="CREDIT_CARD",
            charge_type="RECURRENT",
            expires_at=compute_expires_at(minutes=minutes, now=now),
            provider_customer_id=customer_id,
            provider_subscription_id=None,
        )
        self.db.add(checkout_row)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            logger.info(
                "billing_checkout_concurrent organization_id=%s",
                organization_id,
            )
            winner = self._get_open_checkout(organization_id)
            if winner and winner.checkout_url:
                return self._checkout_public_view(winner)
            raise AuthError(
                "validation_error",
                "Não foi possível iniciar o checkout. Tente novamente.",
                status_code=409,
            ) from exc

        try:
            remote = provider.create_hosted_checkout(
                value=value,
                next_due_date=first_charge,
                item_name=(plan.name if plan else "Croniu Starter")[:30],
                item_description=(plan.description if plan else None),
                external_reference=external_reference,
                success_url=callbacks["successUrl"],
                cancel_url=callbacks["cancelUrl"],
                expired_url=callbacks["expiredUrl"],
                minutes_to_expire=minutes,
                customer_id=customer_id,
            )
        except AuthError:
            checkout_row.status = BillingCheckoutStatus.FAILED.value
            self.db.commit()
            raise

        checkout_row.provider_checkout_id = remote.id
        checkout_row.checkout_url = remote.link
        checkout_row.status = (
            remote.status
            if remote.status in {s.value for s in BillingCheckoutStatus}
            else BillingCheckoutStatus.ACTIVE.value
        )
        if checkout_row.status == BillingCheckoutStatus.PENDING.value:
            checkout_row.status = BillingCheckoutStatus.ACTIVE.value
        if remote.minutes_to_expire:
            checkout_row.expires_at = compute_expires_at(
                minutes=remote.minutes_to_expire, now=now
            )

        subscription.provider = BillingProviderCode.ASAAS.value
        subscription.provider_checkout_id = remote.id
        subscription.plan_id = price.plan_id
        subscription.price_id = price.id
        subscription.plan_code = plan.code if plan else subscription.plan_code
        subscription.country_code = "BR"
        subscription.currency = "BRL"
        subscription.billing_type = "CREDIT_CARD"
        subscription.payment_status = subscription.payment_status or "scheduled"
        subscription.subscribed_at = subscription.subscribed_at or now
        subscription.provider_synced_at = now
        if is_trial_window_open(subscription, now=now):
            subscription.status = SubscriptionStatus.TRIAL.value
        elif subscription.status not in {
            SubscriptionStatus.PAYMENT_PENDING.value,
            SubscriptionStatus.PENDING_ACTIVATION.value,
            SubscriptionStatus.ACTIVE.value,
        }:
            subscription.status = SubscriptionStatus.PENDING_PAYMENT_METHOD.value

        self.db.add(subscription)
        self.db.commit()

        logger.info(
            "billing_hosted_checkout_ok organization_id=%s checkout_id=%s",
            organization_id,
            checkout_row.id,
        )
        _ = remote_ip
        return self._checkout_public_view(checkout_row)

    def get_checkout(
        self,
        *,
        organization_id: uuid.UUID,
        checkout_id: uuid.UUID,
    ) -> dict[str, Any]:
        row = self.db.get(BillingCheckout, checkout_id)
        if row is None or row.organization_id != organization_id:
            raise AuthError(
                "not_found",
                "Checkout não encontrado.",
                status_code=404,
            )
        now = datetime.now(UTC)
        if (
            row.status in OPEN_CHECKOUT_STATUSES
            and row.expires_at
            and row.expires_at <= now
        ):
            row.status = BillingCheckoutStatus.EXPIRED.value
            row.expired_at = row.expired_at or now
            self.db.commit()
        return self._checkout_public_view(row)

    def get_latest_checkout(self, organization_id: uuid.UUID) -> dict[str, Any] | None:
        stmt = (
            select(BillingCheckout)
            .where(BillingCheckout.organization_id == organization_id)
            .order_by(BillingCheckout.created_at.desc())
            .limit(1)
        )
        row = self.db.scalar(stmt)
        if row is None:
            return None
        return self._checkout_public_view(row)

    def _get_open_checkout(self, organization_id: uuid.UUID) -> BillingCheckout | None:
        stmt = (
            select(BillingCheckout)
            .where(
                BillingCheckout.organization_id == organization_id,
                BillingCheckout.status.in_(tuple(OPEN_CHECKOUT_STATUSES)),
            )
            .order_by(BillingCheckout.created_at.desc())
            .limit(1)
        )
        return self.db.scalar(stmt)

    @staticmethod
    def _checkout_public_view(row: BillingCheckout) -> dict[str, Any]:
        from app.billing.setup_status import sanitize_resume_checkout_url

        return {
            "checkout_id": str(row.id),
            "checkout_url": sanitize_resume_checkout_url(row.checkout_url),
            "status": row.status,
            "expires_at": _iso(row.expires_at),
            "amount_cents": row.amount_cents,
            "currency": row.currency,
            "billing_type": row.billing_type,
            "charge_type": row.charge_type,
            "paid_at": _iso(row.paid_at),
            "canceled_at": _iso(row.canceled_at),
            "expired_at": _iso(row.expired_at),
        }


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.isoformat()
