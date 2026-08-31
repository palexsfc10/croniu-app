"""Fixed-period plan pricing: services and cycles gain a pricing_mode.

Additive only. `services.pricing_mode` defaults to 'per_lesson' for every
existing row (current behavior, unchanged). `cycles.pricing_mode` also
defaults to 'per_lesson' via server_default, so every historical cycle is
semantically "per aula" without any data UPDATE — no existing value_cents,
unit_price_cents, subtotal_cents or receivable is touched.

`services.fixed_price_cents` is only meaningful (and required by a CHECK)
when pricing_mode='fixed_period'.

NOTE: this branch was cut from the same origin/main head (0025_user_auth_identities)
as another independent, unmerged PR (#37, smart availability) that also claims
revision id 0026. Whichever merges first keeps 0026; this migration must be
renumbered to chain after the other before this PR merges, if it lands second.

Revision ID: 0026_fixed_period_plan_pricing
Revises: 0025_user_auth_identities
Create Date: 2026-08-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_fixed_period_plan_pricing"
down_revision: str | None = "0025_user_auth_identities"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column(
            "pricing_mode", sa.String(length=20), nullable=False, server_default="per_lesson"
        ),
    )
    op.add_column(
        "services",
        sa.Column("fixed_price_cents", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_services_pricing_mode",
        "services",
        "pricing_mode IN ('per_lesson', 'fixed_period')",
    )
    op.create_check_constraint(
        "ck_services_fixed_price_required",
        "services",
        "pricing_mode <> 'fixed_period' OR fixed_price_cents IS NOT NULL",
    )

    op.add_column(
        "cycles",
        sa.Column(
            "pricing_mode", sa.String(length=20), nullable=False, server_default="per_lesson"
        ),
    )
    op.create_check_constraint(
        "ck_cycles_pricing_mode",
        "cycles",
        "pricing_mode IN ('per_lesson', 'fixed_period')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_cycles_pricing_mode", "cycles", type_="check")
    op.drop_column("cycles", "pricing_mode")

    op.drop_constraint("ck_services_fixed_price_required", "services", type_="check")
    op.drop_constraint("ck_services_pricing_mode", "services", type_="check")
    op.drop_column("services", "fixed_price_cents")
    op.drop_column("services", "pricing_mode")
