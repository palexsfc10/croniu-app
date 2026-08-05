"""Billing Asaas — plans, prices, subscriptions, checkouts, webhooks."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_billing_asaas"
down_revision: str | None = "0011_renewal_whatsapp"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STARTER_PLAN_ID = "b1000000-0000-4000-8000-000000000001"
STARTER_PRICE_ID = "b1000000-0000-4000-8000-000000000002"


def upgrade() -> None:
    op.create_table(
        "billing_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "billing_prices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("billing_plans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column(
            "billing_interval",
            sa.String(32),
            nullable=False,
            server_default="month",
        ),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("external_price_reference", sa.String(255), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_billing_prices_lookup",
        "billing_prices",
        ["provider", "country_code", "currency", "active"],
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan_code", sa.String(100), nullable=False),
        sa.Column(
            "plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("billing_plans.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "price_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("billing_prices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(32), nullable=True),
        sa.Column("provider_customer_id", sa.String(255), nullable=True),
        sa.Column("provider_subscription_id", sa.String(255), nullable=True),
        sa.Column("provider_checkout_id", sa.String(255), nullable=True),
        sa.Column("country_code", sa.String(2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("payment_status", sa.String(64), nullable=True),
        sa.Column("billing_type", sa.String(32), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_billing_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("grace_period_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_effective_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("renewal_day", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("organization_id", name="uq_subscriptions_organization_id"),
    )
    op.create_index(
        "ix_subscriptions_provider_subscription",
        "subscriptions",
        ["provider", "provider_subscription_id"],
    )

    op.create_table(
        "billing_checkouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "price_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("billing_prices.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_checkout_id", sa.String(255), nullable=True),
        sa.Column("external_reference", sa.String(64), nullable=False),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("billing_type", sa.String(32), nullable=False),
        sa.Column("charge_type", sa.String(32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_customer_id", sa.String(255), nullable=True),
        sa.Column("provider_subscription_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_billing_checkouts_organization_id",
        "billing_checkouts",
        ["organization_id"],
    )
    op.create_index(
        "ix_billing_checkouts_subscription_id",
        "billing_checkouts",
        ["subscription_id"],
    )
    op.create_index("ix_billing_checkouts_status", "billing_checkouts", ["status"])
    op.create_index(
        "uq_billing_checkouts_external_reference",
        "billing_checkouts",
        ["external_reference"],
        unique=True,
    )
    op.create_index(
        "uq_billing_checkouts_provider_checkout_id",
        "billing_checkouts",
        ["provider", "provider_checkout_id"],
        unique=True,
        postgresql_where=sa.text("provider_checkout_id IS NOT NULL"),
    )
    op.create_index(
        "uq_billing_checkouts_org_open",
        "billing_checkouts",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('PENDING', 'ACTIVE')"),
    )

    op.create_table(
        "billing_webhook_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("external_event_id", sa.String(255), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column(
            "processing_status",
            sa.String(32),
            nullable=False,
            server_default="received",
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("payload_digest", sa.String(128), nullable=True),
        sa.Column(
            "payload_sanitized",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.UniqueConstraint(
            "provider",
            "external_event_id",
            name="uq_billing_webhook_provider_event",
        ),
    )
    op.create_index(
        "ix_billing_webhook_events_status",
        "billing_webhook_events",
        ["processing_status", "received_at"],
    )

    op.execute(
        sa.text(
            f"""
            INSERT INTO billing_plans (id, code, name, description, status)
            VALUES (
              '{STARTER_PLAN_ID}',
              'starter',
              'Croniu Starter',
              'Plano comercial padrão do Croniu',
              'active'
            )
            ON CONFLICT (code) DO NOTHING
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            INSERT INTO billing_prices (
              id, plan_id, provider, country_code, currency, billing_interval,
              amount_cents, version, active
            )
            SELECT
              '{STARTER_PRICE_ID}',
              '{STARTER_PLAN_ID}',
              'asaas',
              'BR',
              'BRL',
              'month',
              2990,
              1,
              true
            WHERE NOT EXISTS (
              SELECT 1 FROM billing_prices
              WHERE id = '{STARTER_PRICE_ID}'
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_billing_webhook_events_status", table_name="billing_webhook_events")
    op.drop_table("billing_webhook_events")
    op.drop_index("uq_billing_checkouts_org_open", table_name="billing_checkouts")
    op.drop_index(
        "uq_billing_checkouts_provider_checkout_id", table_name="billing_checkouts"
    )
    op.drop_index(
        "uq_billing_checkouts_external_reference", table_name="billing_checkouts"
    )
    op.drop_index("ix_billing_checkouts_status", table_name="billing_checkouts")
    op.drop_index("ix_billing_checkouts_subscription_id", table_name="billing_checkouts")
    op.drop_index("ix_billing_checkouts_organization_id", table_name="billing_checkouts")
    op.drop_table("billing_checkouts")
    op.drop_index("ix_subscriptions_provider_subscription", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index("ix_billing_prices_lookup", table_name="billing_prices")
    op.drop_table("billing_prices")
    op.drop_table("billing_plans")
