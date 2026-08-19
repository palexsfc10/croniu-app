"""Referral / coupon program — partners, campaigns, attributions.

Separate from OrganizationPaymentSettings (client Pix) and from billing/Asaas
models. See docs/ADR-043-referral-coupon-program.md.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ReferralCampaignStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


# Fixed for this version — see DOMAIN_RULES.md "Indicação".
REFERRAL_DISCOUNT_PERCENT = 10


class ReferralPartner(Base):
    """A user enabled by the platform admin to divulge Croniu."""

    __tablename__ = "referral_partners"
    __table_args__ = (UniqueConstraint("user_id", name="uq_referral_partners_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    enabled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReferralCampaign(Base):
    """One coupon/campaign per partner. Code is admin-defined at enablement time."""

    __tablename__ = "referral_campaigns"
    __table_args__ = (
        UniqueConstraint("partner_id", name="uq_referral_campaigns_partner_id"),
        # `code` is always stored normalized (uppercase) by the service layer;
        # this functional index is defense-in-depth against direct SQL / future
        # bypasses of the service (mirrors the migration's raw CREATE INDEX so
        # `alembic check` sees no drift between models and schema).
        Index("uq_referral_campaigns_code_ci", text("lower(code)"), unique=True),
        CheckConstraint(
            "commission_percent >= 0 AND commission_percent <= 100",
            name="ck_referral_campaigns_commission_range",
        ),
        CheckConstraint(
            "discount_percent >= 0 AND discount_percent <= 100",
            name="ck_referral_campaigns_discount_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("referral_partners.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    discount_percent: Mapped[int] = mapped_column(
        Integer, nullable=False, default=REFERRAL_DISCOUNT_PERCENT
    )
    commission_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ReferralCampaignStatus.ACTIVE.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReferralAttribution(Base):
    """Permanent record that an organization was referred by a campaign/coupon.

    Snapshots discount/commission/prices at signup time so the record stays
    valid (and auditable) even if the campaign, its commission, or the partner
    changes later. See ADR-043 for why snapshots are required.
    """

    __tablename__ = "referral_attributions"
    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_referral_attributions_organization_id"),
        Index("ix_referral_attributions_campaign_id", "campaign_id"),
        Index("ix_referral_attributions_partner_id", "partner_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("referral_campaigns.id", ondelete="RESTRICT"),
        nullable=False,
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("referral_partners.id", ondelete="RESTRICT"),
        nullable=False,
    )
    code_used: Mapped[str] = mapped_column(String(32), nullable=False)
    discount_percent_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_percent_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    base_amount_cents_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    final_amount_cents_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    ever_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
