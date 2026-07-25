"""Sprint 2D: client public access, payment settings, renewal requests, payment reports."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_sprint2d_my_cycle"
down_revision: str | None = "0006_sprint2c_cycle_intelligence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "client_public_accesses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("token_hash", name="uq_client_public_accesses_token_hash"),
    )
    op.create_index(
        "ix_client_public_accesses_organization_id",
        "client_public_accesses",
        ["organization_id"],
    )
    op.create_index(
        "ix_client_public_accesses_client_id",
        "client_public_accesses",
        ["client_id"],
    )
    op.create_index(
        "uq_client_public_accesses_one_active",
        "client_public_accesses",
        ["client_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.create_table(
        "organization_payment_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("holder_name", sa.String(length=200), nullable=True),
        sa.Column("pix_key_type", sa.String(length=32), nullable=True),
        sa.Column("pix_key", sa.String(length=320), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("external_payment_url", sa.String(length=2000), nullable=True),
        sa.Column(
            "show_on_my_cycle",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", name="uq_org_payment_settings_org"),
        sa.CheckConstraint(
            "pix_key_type IS NULL OR pix_key_type IN "
            "('cpf', 'cnpj', 'email', 'phone', 'random')",
            name="ck_org_payment_pix_key_type",
        ),
    )

    op.create_table(
        "renewal_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="requested"),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_cycle_id"], ["cycles.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "status IN ('requested', 'acknowledged', 'resolved', 'dismissed')",
            name="ck_renewal_requests_status",
        ),
    )
    op.create_index(
        "ix_renewal_requests_org_status",
        "renewal_requests",
        ["organization_id", "status"],
    )
    op.create_index(
        "uq_renewal_requests_active",
        "renewal_requests",
        ["client_id", "source_cycle_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('requested', 'acknowledged')"),
    )

    op.create_table(
        "payment_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("receivable_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_review"),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("method_note", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("rejection_reason", sa.String(length=500), nullable=True),
        sa.Column(
            "reported_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cycle_id"], ["cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "status IN ('pending_review', 'confirmed', 'rejected')",
            name="ck_payment_reports_status",
        ),
        sa.CheckConstraint("amount_cents >= 0", name="ck_payment_reports_amount"),
    )
    op.create_index(
        "ix_payment_reports_org_status",
        "payment_reports",
        ["organization_id", "status"],
    )
    op.create_index(
        "uq_payment_reports_active",
        "payment_reports",
        ["receivable_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending_review'"),
    )

    op.create_table(
        "payment_proofs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payment_report_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_key", sa.String(length=200), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("mime_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["payment_report_id"], ["payment_reports.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("payment_report_id", name="uq_payment_proofs_report"),
        sa.UniqueConstraint("storage_key", name="uq_payment_proofs_storage_key"),
        sa.CheckConstraint("size_bytes > 0 AND size_bytes <= 5242880", name="ck_payment_proofs_size"),
        sa.CheckConstraint(
            "mime_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name="ck_payment_proofs_mime",
        ),
    )
    op.create_index(
        "ix_payment_proofs_organization_id",
        "payment_proofs",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_payment_proofs_organization_id", table_name="payment_proofs")
    op.drop_table("payment_proofs")
    op.drop_index("uq_payment_reports_active", table_name="payment_reports")
    op.drop_index("ix_payment_reports_org_status", table_name="payment_reports")
    op.drop_table("payment_reports")
    op.drop_index("uq_renewal_requests_active", table_name="renewal_requests")
    op.drop_index("ix_renewal_requests_org_status", table_name="renewal_requests")
    op.drop_table("renewal_requests")
    op.drop_table("organization_payment_settings")
    op.drop_index("uq_client_public_accesses_one_active", table_name="client_public_accesses")
    op.drop_index("ix_client_public_accesses_client_id", table_name="client_public_accesses")
    op.drop_index("ix_client_public_accesses_organization_id", table_name="client_public_accesses")
    op.drop_table("client_public_accesses")
