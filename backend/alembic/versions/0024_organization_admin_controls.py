"""Organization admin controls — disable/reactivate tracking fields.

Adds disabled_at/disabled_reason/status_before_disable to organizations, used
by the platform-admin "Desativar conta" / "Reativar" actions. No CHECK
constraint is added on organizations.status: it has always been a free
string with no enumerated constraint, and this migration doesn't change that
— it only adds nullable columns.

Revision ID: 0024_organization_admin_controls
Revises: 0023_referral_coupon_program
Create Date: 2026-08-19
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_organization_admin_controls"
down_revision: Union[str, None] = "0023_referral_coupon_program"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("disabled_reason", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("status_before_disable", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "status_before_disable")
    op.drop_column("organizations", "disabled_reason")
    op.drop_column("organizations", "disabled_at")
