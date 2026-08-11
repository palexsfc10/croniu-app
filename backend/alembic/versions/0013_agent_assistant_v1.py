"""Croniu AI Assistant V1 — threads, messages, runs, tool calls, usage, pending action extensions."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_agent_assistant_v1"
down_revision: str | None = "0012_billing_asaas"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
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
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'archived')",
            name="ck_agent_threads_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_threads_organization_id", "agent_threads", ["organization_id"])
    op.create_index("ix_agent_threads_user_id", "agent_threads", ["user_id"])
    op.create_index(
        "ix_agent_threads_org_user_status",
        "agent_threads",
        ["organization_id", "user_id", "status"],
    )

    op.create_table(
        "agent_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("message_type", sa.String(length=32), nullable=False, server_default="text"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ok"),
        sa.Column("metadata_safe", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant', 'system', 'tool')",
            name="ck_agent_messages_role",
        ),
        sa.CheckConstraint(
            "message_type IN ('text', 'pending_card', 'system')",
            name="ck_agent_messages_message_type",
        ),
        sa.ForeignKeyConstraint(["thread_id"], ["agent_threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_agent_messages_thread_id", "agent_messages", ["thread_id"])
    op.create_index("ix_agent_messages_organization_id", "agent_messages", ["organization_id"])
    op.create_index("ix_agent_messages_created_at", "agent_messages", ["created_at"])

    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="running"),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cached_input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider_request_id", sa.String(length=128), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["thread_id"], ["agent_threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["agent_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_runs_thread_id", "agent_runs", ["thread_id"])
    op.create_index("ix_agent_runs_organization_id", "agent_runs", ["organization_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])

    op.create_table(
        "agent_tool_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=False),
        sa.Column("risk_class", sa.String(length=32), nullable=False, server_default="read"),
        sa.Column("arguments_safe", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_safe", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ok"),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "risk_class IN ('read', 'write_common', 'write_sensitive', 'forbidden')",
            name="ck_agent_tool_calls_risk_class",
        ),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_tool_calls_run_id", "agent_tool_calls", ["run_id"])
    op.create_index("ix_agent_tool_calls_organization_id", "agent_tool_calls", ["organization_id"])
    op.create_index("ix_agent_tool_calls_user_id", "agent_tool_calls", ["user_id"])
    op.create_index("ix_agent_tool_calls_created_at", "agent_tool_calls", ["created_at"])

    op.create_table(
        "agent_usage_daily",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("organization_id", "day", name="pk_agent_usage_daily"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_usage_daily_day", "agent_usage_daily", ["day"])

    # --- Extend agent_pending_actions -------------------------------------
    op.add_column(
        "agent_pending_actions",
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "agent_pending_actions",
        sa.Column(
            "risk_class", sa.String(length=32), nullable=False, server_default="write_common"
        ),
    )
    op.add_column(
        "agent_pending_actions",
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "agent_pending_actions",
        sa.Column("state_hash", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "agent_pending_actions",
        sa.Column("summary_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_foreign_key(
        "fk_agent_pending_actions_thread_id",
        "agent_pending_actions",
        "agent_threads",
        ["thread_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_agent_pending_actions_thread_id", "agent_pending_actions", ["thread_id"]
    )
    op.create_index(
        "uq_agent_pending_actions_idempotency_key_pending",
        "agent_pending_actions",
        ["organization_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("status = 'pending' AND idempotency_key IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_agent_pending_actions_risk_class",
        "agent_pending_actions",
        "risk_class IN ('read', 'write_common', 'write_sensitive', 'forbidden')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_agent_pending_actions_risk_class", "agent_pending_actions", type_="check"
    )
    op.drop_index(
        "uq_agent_pending_actions_idempotency_key_pending", table_name="agent_pending_actions"
    )
    op.drop_index("ix_agent_pending_actions_thread_id", table_name="agent_pending_actions")
    op.drop_constraint(
        "fk_agent_pending_actions_thread_id", "agent_pending_actions", type_="foreignkey"
    )
    op.drop_column("agent_pending_actions", "summary_fields")
    op.drop_column("agent_pending_actions", "state_hash")
    op.drop_column("agent_pending_actions", "idempotency_key")
    op.drop_column("agent_pending_actions", "risk_class")
    op.drop_column("agent_pending_actions", "thread_id")

    op.drop_index("ix_agent_usage_daily_day", table_name="agent_usage_daily")
    op.drop_table("agent_usage_daily")

    op.drop_index("ix_agent_tool_calls_created_at", table_name="agent_tool_calls")
    op.drop_index("ix_agent_tool_calls_user_id", table_name="agent_tool_calls")
    op.drop_index("ix_agent_tool_calls_organization_id", table_name="agent_tool_calls")
    op.drop_index("ix_agent_tool_calls_run_id", table_name="agent_tool_calls")
    op.drop_table("agent_tool_calls")

    op.drop_index("ix_agent_runs_user_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_organization_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_thread_id", table_name="agent_runs")
    op.drop_table("agent_runs")

    op.drop_index("ix_agent_messages_created_at", table_name="agent_messages")
    op.drop_index("ix_agent_messages_organization_id", table_name="agent_messages")
    op.drop_index("ix_agent_messages_thread_id", table_name="agent_messages")
    op.drop_table("agent_messages")

    op.drop_index("ix_agent_threads_org_user_status", table_name="agent_threads")
    op.drop_index("ix_agent_threads_user_id", table_name="agent_threads")
    op.drop_index("ix_agent_threads_organization_id", table_name="agent_threads")
    op.drop_table("agent_threads")
