"""Referral / coupon program — domain service.

Backend is the source of truth for eligibility and price. The frontend only
sends intent (a code); this module decides validity, discount and the final
amount charged. See docs/ADR-043-referral-coupon-program.md.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.billing import Subscription, SubscriptionStatus
from app.models.referral import (
    REFERRAL_DISCOUNT_PERCENT,
    ReferralAttribution,
    ReferralCampaign,
    ReferralCampaignStatus,
    ReferralPartner,
)
from app.models.user import User
from app.services.auth import AuthError

CODE_PATTERN = re.compile(r"^[A-Z0-9_-]{3,32}$")

RESERVED_CODES = frozenset(
    {
        "ADMIN",
        "ADMINISTRADOR",
        "CRONIU",
        "CRONIU10",
        "NTWS",
        "SUPORTE",
        "SUPPORT",
        "TESTE",
        "TEST",
        "NULL",
        "UNDEFINED",
        "NONE",
        "REF",
        "PARTNER",
        "PARCEIRO",
        "API",
        "ROOT",
        "SYSTEM",
    }
)


def normalize_code(raw: str) -> str:
    """Uppercase + trim. Raises AuthError(validation_error) if the shape is invalid."""
    code = (raw or "").strip().upper()
    if not CODE_PATTERN.match(code):
        raise AuthError(
            "validation_error",
            "Código inválido. Use 3 a 32 caracteres: letras, números, hífen ou underscore.",
            status_code=422,
        )
    if code in RESERVED_CODES:
        raise AuthError(
            "reserved_code",
            "Este código é reservado e não pode ser usado.",
            status_code=422,
        )
    return code


def _campaign_by_code(db: Session, code: str, *, exclude_campaign_id: uuid.UUID | None = None):
    stmt = select(ReferralCampaign).where(func_lower_eq(ReferralCampaign.code, code))
    campaign = db.scalar(stmt)
    if (
        campaign is not None
        and exclude_campaign_id is not None
        and campaign.id == exclude_campaign_id
    ):
        return None
    return campaign


def func_lower_eq(column, value: str):
    return func.lower(column) == value.lower()


def code_available(db: Session, code: str, *, exclude_campaign_id: uuid.UUID | None = None) -> bool:
    normalized = normalize_code(code)
    return _campaign_by_code(db, normalized, exclude_campaign_id=exclude_campaign_id) is None


@dataclass
class EnablePartnerResult:
    partner: ReferralPartner
    campaign: ReferralCampaign
    code_changed: bool


def enable_partner(
    db: Session,
    *,
    target_user_id: uuid.UUID,
    code: str,
    commission_percent: Decimal,
    actor_user_id: uuid.UUID,
) -> EnablePartnerResult:
    """Enable (or re-enable) a divulgador and upsert their campaign.

    Only the platform admin calls this. Code renaming is refused once the
    campaign already has attributions — see ADR-043.
    """
    if commission_percent < 0 or commission_percent > 100:
        raise AuthError(
            "validation_error", "Comissão deve estar entre 0% e 100%.", status_code=422
        )

    target_user = db.get(User, target_user_id)
    if target_user is None:
        raise AuthError("not_found", "Usuário não encontrado.", status_code=404)

    normalized_code = normalize_code(code)

    partner = db.scalar(select(ReferralPartner).where(ReferralPartner.user_id == target_user_id))
    now = datetime.now(UTC)
    if partner is None:
        partner = ReferralPartner(
            user_id=target_user_id,
            enabled=True,
            enabled_at=now,
            enabled_by_user_id=actor_user_id,
        )
        db.add(partner)
        db.flush()
    else:
        partner.enabled = True
        partner.enabled_at = now
        partner.disabled_at = None
        partner.enabled_by_user_id = actor_user_id

    campaign = db.scalar(
        select(ReferralCampaign).where(ReferralCampaign.partner_id == partner.id)
    )
    code_changed = False
    if campaign is None:
        existing = _campaign_by_code(db, normalized_code)
        if existing is not None:
            raise AuthError("code_taken", "Este código já está em uso.", status_code=409)
        campaign = ReferralCampaign(
            partner_id=partner.id,
            code=normalized_code,
            discount_percent=REFERRAL_DISCOUNT_PERCENT,
            commission_percent=commission_percent,
            status=ReferralCampaignStatus.ACTIVE.value,
        )
        db.add(campaign)
    else:
        if campaign.code != normalized_code:
            has_attributions = (
                db.scalar(
                    select(ReferralAttribution.id).where(
                        ReferralAttribution.campaign_id == campaign.id
                    )
                )
                is not None
            )
            if has_attributions:
                raise AuthError(
                    "code_locked",
                    "Este cupom já possui indicações e o código não pode ser alterado.",
                    status_code=409,
                )
            existing = _campaign_by_code(db, normalized_code, exclude_campaign_id=campaign.id)
            if existing is not None:
                raise AuthError("code_taken", "Este código já está em uso.", status_code=409)
            campaign.code = normalized_code
            code_changed = True
        campaign.commission_percent = commission_percent
        campaign.status = ReferralCampaignStatus.ACTIVE.value

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AuthError("code_taken", "Este código já está em uso.", status_code=409) from exc

    db.commit()
    db.refresh(partner)
    db.refresh(campaign)
    return EnablePartnerResult(partner=partner, campaign=campaign, code_changed=code_changed)


def disable_partner(db: Session, *, partner_id: uuid.UUID) -> ReferralPartner:
    partner = db.get(ReferralPartner, partner_id)
    if partner is None:
        raise AuthError("not_found", "Divulgador não encontrado.", status_code=404)
    partner.enabled = False
    partner.disabled_at = datetime.now(UTC)
    campaign = db.scalar(select(ReferralCampaign).where(ReferralCampaign.partner_id == partner.id))
    if campaign is not None:
        campaign.status = ReferralCampaignStatus.INACTIVE.value
    db.commit()
    db.refresh(partner)
    return partner


def enable_existing_partner(db: Session, *, partner_id: uuid.UUID) -> ReferralPartner:
    partner = db.get(ReferralPartner, partner_id)
    if partner is None:
        raise AuthError("not_found", "Divulgador não encontrado.", status_code=404)
    partner.enabled = True
    partner.enabled_at = datetime.now(UTC)
    partner.disabled_at = None
    campaign = db.scalar(select(ReferralCampaign).where(ReferralCampaign.partner_id == partner.id))
    if campaign is not None:
        campaign.status = ReferralCampaignStatus.ACTIVE.value
    db.commit()
    db.refresh(partner)
    return partner


@dataclass
class PublicCouponCheck:
    valid: bool
    code: str
    discount_percent: int | None = None


def validate_public_code(db: Session, raw_code: str) -> PublicCouponCheck:
    """Public, unauthenticated lookup used by /register?ref=CODE.

    Never reveals whether an invalid code once existed, who the partner is,
    or any other detail beyond a boolean + the (fixed) discount percent.
    """
    try:
        normalized = normalize_code(raw_code)
    except AuthError:
        return PublicCouponCheck(valid=False, code=(raw_code or "").strip().upper()[:32])

    campaign = db.scalar(
        select(ReferralCampaign).where(
            func_lower_eq(ReferralCampaign.code, normalized),
            ReferralCampaign.status == ReferralCampaignStatus.ACTIVE.value,
        )
    )
    if campaign is None:
        return PublicCouponCheck(valid=False, code=normalized)

    partner = db.get(ReferralPartner, campaign.partner_id)
    if partner is None or not partner.enabled:
        return PublicCouponCheck(valid=False, code=normalized)

    return PublicCouponCheck(
        valid=True, code=normalized, discount_percent=campaign.discount_percent
    )


def _resolve_base_amount_cents(db: Session) -> int:
    from app.billing.service import ensure_billing_catalog

    _, price = ensure_billing_catalog(db)
    return int(price.amount_cents)


def create_attribution_if_eligible(
    db: Session,
    *,
    organization_id: uuid.UUID,
    raw_code: str | None,
) -> ReferralAttribution | None:
    """Persist a permanent attribution for a brand-new organization, or return None.

    Silent no-op (never raises) on invalid/inactive codes or an org that
    already has an attribution — registration must never fail because of a
    coupon. Called once, right after organization + membership are created.
    """
    if not raw_code:
        return None

    check = validate_public_code(db, raw_code)
    if not check.valid:
        return None

    campaign = db.scalar(
        select(ReferralCampaign).where(
            func_lower_eq(ReferralCampaign.code, check.code),
            ReferralCampaign.status == ReferralCampaignStatus.ACTIVE.value,
        )
    )
    if campaign is None:
        return None

    already = db.scalar(
        select(ReferralAttribution.id).where(
            ReferralAttribution.organization_id == organization_id
        )
    )
    if already is not None:
        return None

    base_amount_cents = _resolve_base_amount_cents(db)
    final_amount_cents = _apply_discount(base_amount_cents, campaign.discount_percent)

    attribution = ReferralAttribution(
        organization_id=organization_id,
        campaign_id=campaign.id,
        partner_id=campaign.partner_id,
        code_used=check.code,
        discount_percent_snapshot=campaign.discount_percent,
        commission_percent_snapshot=campaign.commission_percent,
        base_amount_cents_snapshot=base_amount_cents,
        final_amount_cents_snapshot=final_amount_cents,
    )
    db.add(attribution)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return None
    return attribution


def _apply_discount(amount_cents: int, discount_percent: int) -> int:
    factor = (Decimal(100) - Decimal(discount_percent)) / Decimal(100)
    discounted = (Decimal(amount_cents) * factor).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(discounted)


def get_attribution(db: Session, organization_id: uuid.UUID) -> ReferralAttribution | None:
    return db.scalar(
        select(ReferralAttribution).where(
            ReferralAttribution.organization_id == organization_id
        )
    )


def resolve_checkout_amount_cents(
    db: Session, *, organization_id: uuid.UUID, base_amount_cents: int
) -> tuple[int, ReferralAttribution | None]:
    """Backend-computed final price. Never trusts client-supplied discounts.

    Uses the attribution's snapshotted discount percent (fixed at 10% in this
    version) applied to the *current* catalog price, so a later catalog price
    change is still honoured consistently for referred and non-referred
    organizations alike.
    """
    attribution = get_attribution(db, organization_id)
    if attribution is None:
        return base_amount_cents, None
    final_amount_cents = _apply_discount(base_amount_cents, attribution.discount_percent_snapshot)
    return final_amount_cents, attribution


def mark_referral_paid(db: Session, organization_id: uuid.UUID) -> None:
    """Idempotently mark the org's attribution as having had a confirmed payment.

    Historical counter — never cleared by later cancellation/refund.
    """
    attribution = get_attribution(db, organization_id)
    if attribution is None or attribution.ever_paid_at is not None:
        return
    attribution.ever_paid_at = datetime.now(UTC)
    db.add(attribution)


@dataclass
class PartnerSummary:
    partner_id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str
    user_email: str
    enabled: bool
    campaign_id: uuid.UUID | None
    code: str | None
    status: str | None
    discount_percent: int | None
    commission_percent: Decimal | None
    signups: int
    payers: int
    active: int
    projected_monthly_commission_cents: int


def list_partner_summaries(db: Session) -> list[PartnerSummary]:
    partners = db.scalars(select(ReferralPartner)).all()
    summaries: list[PartnerSummary] = []
    for partner in partners:
        user = db.get(User, partner.user_id)
        campaign = db.scalar(
            select(ReferralCampaign).where(ReferralCampaign.partner_id == partner.id)
        )
        signups = 0
        payers = 0
        active = 0
        projected_cents = 0
        if campaign is not None:
            attributions = db.scalars(
                select(ReferralAttribution).where(
                    ReferralAttribution.campaign_id == campaign.id
                )
            ).all()
            signups = len(attributions)
            payers = sum(1 for a in attributions if a.ever_paid_at is not None)
            for attribution in attributions:
                sub = db.scalar(
                    select(Subscription).where(
                        Subscription.organization_id == attribution.organization_id
                    )
                )
                if sub is not None and sub.status == SubscriptionStatus.ACTIVE.value:
                    active += 1
                    commission = (
                        Decimal(attribution.final_amount_cents_snapshot)
                        * attribution.commission_percent_snapshot
                        / Decimal(100)
                    )
                    projected_cents += int(commission.to_integral_value(rounding=ROUND_HALF_UP))

        summaries.append(
            PartnerSummary(
                partner_id=partner.id,
                user_id=partner.user_id,
                user_full_name=user.full_name if user else "",
                user_email=user.email if user else "",
                enabled=partner.enabled,
                campaign_id=campaign.id if campaign else None,
                code=campaign.code if campaign else None,
                status=campaign.status if campaign else None,
                discount_percent=campaign.discount_percent if campaign else None,
                commission_percent=campaign.commission_percent if campaign else None,
                signups=signups,
                payers=payers,
                active=active,
                projected_monthly_commission_cents=projected_cents,
            )
        )
    return summaries


def get_my_partner_view(db: Session, user_id: uuid.UUID) -> dict | None:
    """Divulgador-facing view — code + link + discount only, no financial data."""
    partner = db.scalar(select(ReferralPartner).where(ReferralPartner.user_id == user_id))
    if partner is None or not partner.enabled:
        return None
    campaign = db.scalar(
        select(ReferralCampaign).where(
            ReferralCampaign.partner_id == partner.id,
            ReferralCampaign.status == ReferralCampaignStatus.ACTIVE.value,
        )
    )
    if campaign is None:
        return None
    return {
        "code": campaign.code,
        "discount_percent": campaign.discount_percent,
    }
