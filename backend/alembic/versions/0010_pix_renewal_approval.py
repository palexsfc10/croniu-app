"""Pix institution + renewal created_cycle link for atomic approval."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_pix_renewal_approval"
down_revision: str | None = "0009_agent_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization_payment_settings",
        sa.Column("institution", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "renewal_requests",
        sa.Column("created_cycle_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_renewal_requests_created_cycle",
        "renewal_requests",
        "cycles",
        ["created_cycle_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "uq_renewal_requests_created_cycle",
        "renewal_requests",
        ["created_cycle_id"],
        unique=True,
        postgresql_where=sa.text("created_cycle_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_renewal_requests_created_cycle", table_name="renewal_requests")
    op.drop_constraint("fk_renewal_requests_created_cycle", "renewal_requests", type_="foreignkey")
    op.drop_column("renewal_requests", "created_cycle_id")
    op.drop_column("organization_payment_settings", "institution")
