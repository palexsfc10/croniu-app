"""Add user_feedbacks table for in-app help/feedback.

Revision ID: 0017_user_feedbacks
Revises: 0016_agent_voice_usage
Create Date: 2026-08-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017_user_feedbacks"
down_revision = "0016_agent_voice_usage"
branch_labels = None
depends_on = None

CATEGORIES = ("suggestion", "problem", "question", "praise", "other")
STATUSES = ("new", "reviewing", "resolved", "archived")


def upgrade() -> None:
    op.create_table(
        "user_feedbacks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("subject", sa.String(120), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="new"),
        sa.Column("technical_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
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
        sa.CheckConstraint(
            "category IN ('suggestion','problem','question','praise','other')",
            name="ck_user_feedbacks_category",
        ),
        sa.CheckConstraint(
            "status IN ('new','reviewing','resolved','archived')",
            name="ck_user_feedbacks_status",
        ),
    )
    op.create_index("ix_user_feedbacks_organization_id", "user_feedbacks", ["organization_id"])
    op.create_index("ix_user_feedbacks_user_id", "user_feedbacks", ["user_id"])
    op.create_index("ix_user_feedbacks_category", "user_feedbacks", ["category"])
    op.create_index("ix_user_feedbacks_status", "user_feedbacks", ["status"])
    op.create_index("ix_user_feedbacks_created_at", "user_feedbacks", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_user_feedbacks_created_at", table_name="user_feedbacks")
    op.drop_index("ix_user_feedbacks_status", table_name="user_feedbacks")
    op.drop_index("ix_user_feedbacks_category", table_name="user_feedbacks")
    op.drop_index("ix_user_feedbacks_user_id", table_name="user_feedbacks")
    op.drop_index("ix_user_feedbacks_organization_id", table_name="user_feedbacks")
    op.drop_table("user_feedbacks")
