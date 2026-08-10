"""Store sanitized execution result on pending actions for idempotent confirm replay."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_agent_pending_result_safe"
down_revision: str | None = "0013_agent_assistant_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agent_pending_actions",
        sa.Column("result_safe", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "agent_pending_actions",
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agent_pending_actions", "confirmed_at")
    op.drop_column("agent_pending_actions", "result_safe")
