"""Plan duration/cadence fields, org routine defaults, operational occurrences.

Revision ID: 0021_plan_cadence
Revises: 0020_prof_accomp_ux
Create Date: 2026-08-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021_plan_cadence"
down_revision: Union[str, None] = "0020_prof_accomp_ux"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("protocols", sa.Column("objective", sa.Text(), nullable=True))
    op.add_column("protocols", sa.Column("duration_value", sa.Integer(), nullable=True))
    op.add_column("protocols", sa.Column("duration_unit", sa.String(length=16), nullable=True))
    op.add_column("protocols", sa.Column("starts_on", sa.Date(), nullable=True))
    op.add_column("protocols", sa.Column("ends_on", sa.Date(), nullable=True))
    op.add_column("protocols", sa.Column("feedback_interval_days", sa.Integer(), nullable=True))
    op.add_column("protocols", sa.Column("next_feedback_on", sa.Date(), nullable=True))
    op.add_column("protocols", sa.Column("last_review_on", sa.Date(), nullable=True))
    op.add_column("protocols", sa.Column("last_feedback_on", sa.Date(), nullable=True))
    op.add_column("protocols", sa.Column("extension_note", sa.Text(), nullable=True))

    op.add_column(
        "organizations",
        sa.Column("routine_defaults", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "operational_occurrences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("protocol_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("protocol_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("occurrence_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("operational_date", sa.Date(), nullable=False),
        sa.Column("deferred_until", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="computed"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=180), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["protocol_id"], ["protocols.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["protocol_version_id"], ["protocol_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cycle_id"], ["cycles.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_op_occ_org_idem"),
    )
    op.create_index("ix_op_occ_org_id", "operational_occurrences", ["organization_id"])
    op.create_index("ix_op_occ_org_opdate", "operational_occurrences", ["organization_id", "operational_date"])
    op.create_index("ix_op_occ_client_id", "operational_occurrences", ["client_id"])
    op.create_index("ix_op_occ_protocol_id", "operational_occurrences", ["protocol_id"])


def downgrade() -> None:
    op.drop_index("ix_op_occ_protocol_id", table_name="operational_occurrences")
    op.drop_index("ix_op_occ_client_id", table_name="operational_occurrences")
    op.drop_index("ix_op_occ_org_opdate", table_name="operational_occurrences")
    op.drop_index("ix_op_occ_org_id", table_name="operational_occurrences")
    op.drop_table("operational_occurrences")
    op.drop_column("organizations", "routine_defaults")
    op.drop_column("protocols", "extension_note")
    op.drop_column("protocols", "last_feedback_on")
    op.drop_column("protocols", "last_review_on")
    op.drop_column("protocols", "next_feedback_on")
    op.drop_column("protocols", "feedback_interval_days")
    op.drop_column("protocols", "ends_on")
    op.drop_column("protocols", "starts_on")
    op.drop_column("protocols", "duration_unit")
    op.drop_column("protocols", "duration_value")
    op.drop_column("protocols", "objective")
