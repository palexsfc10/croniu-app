"""Referral / coupon program — partners, campaigns, attributions.

Revision ID: 0023_referral_coupon_program
Revises: 0022_form_template_pin
Create Date: 2026-08-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_referral_coupon_program"
down_revision: Union[str, None] = "0022_form_template_pin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "referral_partners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("enabled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["enabled_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("user_id", name="uq_referral_partners_user_id"),
    )

    op.create_table(
        "referral_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("discount_percent", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("commission_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["partner_id"], ["referral_partners.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("partner_id", name="uq_referral_campaigns_partner_id"),
        sa.UniqueConstraint("code", name="uq_referral_campaigns_code"),
        sa.CheckConstraint(
            "commission_percent >= 0 AND commission_percent <= 100",
            name="ck_referral_campaigns_commission_range",
        ),
        sa.CheckConstraint(
            "discount_percent >= 0 AND discount_percent <= 100",
            name="ck_referral_campaigns_discount_range",
        ),
    )
    # Defense-in-depth: case-insensitive uniqueness even if the service-layer
    # normalization (upper + strip) is ever bypassed by direct SQL.
    op.execute(
        "CREATE UNIQUE INDEX uq_referral_campaigns_code_ci "
        "ON referral_campaigns (lower(code))"
    )

    op.create_table(
        "referral_attributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code_used", sa.String(length=32), nullable=False),
        sa.Column("discount_percent_snapshot", sa.Integer(), nullable=False),
        sa.Column("commission_percent_snapshot", sa.Numeric(5, 2), nullable=False),
        sa.Column("base_amount_cents_snapshot", sa.Integer(), nullable=False),
        sa.Column("final_amount_cents_snapshot", sa.Integer(), nullable=False),
        sa.Column("ever_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["campaign_id"], ["referral_campaigns.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["partner_id"], ["referral_partners.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("organization_id", name="uq_referral_attributions_organization_id"),
    )
    op.create_index(
        "ix_referral_attributions_campaign_id", "referral_attributions", ["campaign_id"]
    )
    op.create_index(
        "ix_referral_attributions_partner_id", "referral_attributions", ["partner_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_referral_attributions_partner_id", table_name="referral_attributions")
    op.drop_index("ix_referral_attributions_campaign_id", table_name="referral_attributions")
    op.drop_table("referral_attributions")
    op.execute("DROP INDEX IF EXISTS uq_referral_campaigns_code_ci")
    op.drop_table("referral_campaigns")
    op.drop_table("referral_partners")
