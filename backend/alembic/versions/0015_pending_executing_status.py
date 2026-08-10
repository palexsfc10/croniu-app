"""Allow executing status on agent_pending_actions for CAS confirm."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_pending_executing_status"
down_revision: str | None = "0014_agent_pending_result_safe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_agent_pending_actions_status", "agent_pending_actions", type_="check")
    op.create_check_constraint(
        "ck_agent_pending_actions_status",
        "agent_pending_actions",
        "status IN ('pending', 'confirmed', 'executing', 'cancelled', 'expired', 'executed', 'failed')",
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE agent_pending_actions SET status='confirmed' WHERE status='executing'"
        )
    )
    op.drop_constraint("ck_agent_pending_actions_status", "agent_pending_actions", type_="check")
    op.create_check_constraint(
        "ck_agent_pending_actions_status",
        "agent_pending_actions",
        "status IN ('pending', 'confirmed', 'cancelled', 'expired', 'executed', 'failed')",
    )
