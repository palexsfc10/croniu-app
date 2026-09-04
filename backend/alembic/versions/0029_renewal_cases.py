"""Renewal cases — professional-side renewal process, separate from renewal_requests."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0029_renewal_cases"
down_revision: str | None = "0028_user_whatsapp_consent"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "renewal_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("next_contact_date", sa.Date(), nullable=True),
        sa.Column("resolution_reason", sa.String(length=32), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("successor_cycle_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("renewal_request_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_cycle_id"], ["cycles.id"], ondelete="CASCADE", name="fk_renewal_cases_source_cycle"
        ),
        sa.ForeignKeyConstraint(
            ["successor_cycle_id"],
            ["cycles.id"],
            ondelete="SET NULL",
            name="fk_renewal_cases_successor_cycle",
        ),
        sa.ForeignKeyConstraint(
            ["renewal_request_id"],
            ["renewal_requests.id"],
            ondelete="SET NULL",
            name="fk_renewal_cases_renewal_request",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'awaiting_client', 'renewed', 'ended_without_renewal')",
            name="ck_renewal_cases_status",
        ),
        sa.CheckConstraint(
            "resolution_reason IS NULL OR resolution_reason IN "
            "('client_declined', 'no_response', 'service_ended', 'other')",
            name="ck_renewal_cases_resolution_reason",
        ),
    )
    op.create_index(
        "ix_renewal_cases_org_status", "renewal_cases", ["organization_id", "status"]
    )
    op.create_index(
        "uq_renewal_cases_source_cycle", "renewal_cases", ["source_cycle_id"], unique=True
    )
    op.create_index(
        "uq_renewal_cases_successor_cycle",
        "renewal_cases",
        ["successor_cycle_id"],
        unique=True,
        postgresql_where=sa.text("successor_cycle_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_renewal_cases_successor_cycle", table_name="renewal_cases")
    op.drop_index("uq_renewal_cases_source_cycle", table_name="renewal_cases")
    op.drop_index("ix_renewal_cases_org_status", table_name="renewal_cases")
    op.drop_table("renewal_cases")
