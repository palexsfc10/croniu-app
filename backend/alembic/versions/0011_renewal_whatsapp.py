"""WhatsApp for renewal proof + payment_reported renewal status."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_renewal_whatsapp"
down_revision: str | None = "0010_pix_renewal_approval"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization_payment_settings",
        sa.Column("whatsapp_e164", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "organization_payment_settings",
        sa.Column(
            "whatsapp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.drop_constraint("ck_renewal_requests_status", "renewal_requests", type_="check")
    op.create_check_constraint(
        "ck_renewal_requests_status",
        "renewal_requests",
        "status IN ('requested', 'acknowledged', 'payment_reported', 'resolved', 'dismissed')",
    )
    op.drop_index("uq_renewal_requests_active", table_name="renewal_requests")
    op.create_index(
        "uq_renewal_requests_active",
        "renewal_requests",
        ["client_id", "source_cycle_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('requested', 'acknowledged', 'payment_reported')"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_renewal_requests_active", table_name="renewal_requests")
    op.create_index(
        "uq_renewal_requests_active",
        "renewal_requests",
        ["client_id", "source_cycle_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('requested', 'acknowledged')"),
    )
    op.drop_constraint("ck_renewal_requests_status", "renewal_requests", type_="check")
    op.create_check_constraint(
        "ck_renewal_requests_status",
        "renewal_requests",
        "status IN ('requested', 'acknowledged', 'resolved', 'dismissed')",
    )
    op.drop_column("organization_payment_settings", "whatsapp_enabled")
    op.drop_column("organization_payment_settings", "whatsapp_e164")
