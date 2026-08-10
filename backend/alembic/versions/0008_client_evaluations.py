"""Sprint: client evaluations (draft/published) + optional criteria."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_client_evaluations"
down_revision: str | None = "0007_sprint2d_my_cycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "client_evaluations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("evaluated_from", sa.Date(), nullable=True),
        sa.Column("evaluated_to", sa.Date(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("achievements", sa.Text(), nullable=True),
        sa.Column("attention_points", sa.Text(), nullable=True),
        sa.Column("next_goals", sa.Text(), nullable=True),
        sa.Column("client_message", sa.Text(), nullable=True),
        sa.Column("private_notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('draft', 'published', 'archived')",
            name="ck_client_evaluations_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_client_evaluations_organization_id", "client_evaluations", ["organization_id"])
    op.create_index("ix_client_evaluations_client_id", "client_evaluations", ["client_id"])
    op.create_index("ix_client_evaluations_author_user_id", "client_evaluations", ["author_user_id"])
    op.create_index(
        "ix_client_evaluations_org_client_status",
        "client_evaluations",
        ["organization_id", "client_id", "status"],
    )
    op.create_index(
        "ix_client_evaluations_published_at",
        "client_evaluations",
        ["published_at"],
    )

    op.create_table(
        "client_evaluation_criteria",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("evaluation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("scale_max", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint(
            "score IS NULL OR (score >= 1 AND score <= scale_max)",
            name="ck_client_evaluation_criteria_score",
        ),
        sa.CheckConstraint(
            "scale_max >= 2 AND scale_max <= 10",
            name="ck_client_evaluation_criteria_scale",
        ),
        sa.ForeignKeyConstraint(
            ["evaluation_id"], ["client_evaluations.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_client_evaluation_criteria_evaluation_id",
        "client_evaluation_criteria",
        ["evaluation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_client_evaluation_criteria_evaluation_id", table_name="client_evaluation_criteria")
    op.drop_table("client_evaluation_criteria")
    op.drop_index("ix_client_evaluations_published_at", table_name="client_evaluations")
    op.drop_index("ix_client_evaluations_org_client_status", table_name="client_evaluations")
    op.drop_index("ix_client_evaluations_author_user_id", table_name="client_evaluations")
    op.drop_index("ix_client_evaluations_client_id", table_name="client_evaluations")
    op.drop_index("ix_client_evaluations_organization_id", table_name="client_evaluations")
    op.drop_table("client_evaluations")
