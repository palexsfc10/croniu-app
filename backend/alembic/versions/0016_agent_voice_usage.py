"""Add voice usage counters to agent_usage_daily.

Revision ID: 0016_agent_voice_usage
Revises: 0015_pending_executing_status
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_agent_voice_usage"
down_revision = "0015_pending_executing_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_usage_daily",
        sa.Column("voice_transcriptions", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agent_usage_daily",
        sa.Column("voice_audio_seconds", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agent_usage_daily",
        sa.Column("voice_errors", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agent_usage_daily",
        sa.Column("voice_latency_ms_sum", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agent_usage_daily",
        sa.Column(
            "voice_estimated_cost_cents",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "agent_usage_daily",
        sa.Column("voice_rate_limit_blocks", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("agent_usage_daily", "voice_rate_limit_blocks")
    op.drop_column("agent_usage_daily", "voice_estimated_cost_cents")
    op.drop_column("agent_usage_daily", "voice_latency_ms_sum")
    op.drop_column("agent_usage_daily", "voice_errors")
    op.drop_column("agent_usage_daily", "voice_audio_seconds")
    op.drop_column("agent_usage_daily", "voice_transcriptions")
