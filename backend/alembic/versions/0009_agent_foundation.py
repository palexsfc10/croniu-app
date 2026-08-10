"""Sprint: agent pending actions + audit logs."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_agent_foundation"
down_revision: str | None = "0008_client_evaluations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_pending_actions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=False),
        sa.Column("arguments", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("summary_text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_entity_id", sa.String(length=100), nullable=True),
        sa.Column("error_sanitized", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'cancelled', 'expired', 'executed', 'failed')",
            name="ck_agent_pending_actions_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_agent_pending_actions_organization_id", "agent_pending_actions", ["organization_id"]
    )
    op.create_index("ix_agent_pending_actions_user_id", "agent_pending_actions", ["user_id"])
    op.create_index(
        "ix_agent_pending_actions_org_user_status",
        "agent_pending_actions",
        ["organization_id", "user_id", "status"],
    )

    op.create_table(
        "agent_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=True),
        sa.Column("operation", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("confirmation_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("entity_id", sa.String(length=100), nullable=True),
        sa.Column("error_sanitized", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("metadata_safe", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_audit_logs_organization_id", "agent_audit_logs", ["organization_id"])
    op.create_index("ix_agent_audit_logs_user_id", "agent_audit_logs", ["user_id"])
    op.create_index("ix_agent_audit_logs_operation", "agent_audit_logs", ["operation"])
    op.create_index("ix_agent_audit_logs_request_id", "agent_audit_logs", ["request_id"])
    op.create_index("ix_agent_audit_logs_created_at", "agent_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_agent_audit_logs_created_at", table_name="agent_audit_logs")
    op.drop_index("ix_agent_audit_logs_request_id", table_name="agent_audit_logs")
    op.drop_index("ix_agent_audit_logs_operation", table_name="agent_audit_logs")
    op.drop_index("ix_agent_audit_logs_user_id", table_name="agent_audit_logs")
    op.drop_index("ix_agent_audit_logs_organization_id", table_name="agent_audit_logs")
    op.drop_table("agent_audit_logs")
    op.drop_index("ix_agent_pending_actions_org_user_status", table_name="agent_pending_actions")
    op.drop_index("ix_agent_pending_actions_user_id", table_name="agent_pending_actions")
    op.drop_index("ix_agent_pending_actions_organization_id", table_name="agent_pending_actions")
    op.drop_table("agent_pending_actions")
