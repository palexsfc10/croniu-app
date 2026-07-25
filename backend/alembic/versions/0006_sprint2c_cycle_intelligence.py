"""Sprint 2C: service lesson duration, cycle templates, intelligent cycle fields."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_sprint2c_cycle_intelligence"
down_revision: str | None = "0005_sprint2b_agenda"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column(
            "default_duration_minutes",
            sa.Integer(),
            nullable=False,
            server_default="60",
        ),
    )

    op.create_table(
        "cycle_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("weekly_frequency", sa.Integer(), nullable=False),
        sa.Column("duration_type", sa.String(length=32), nullable=False),
        sa.Column("duration_value", sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "weekly_frequency >= 1 AND weekly_frequency <= 7",
            name="ck_cycle_templates_weekly_frequency",
        ),
        sa.CheckConstraint(
            "duration_type IN ('calendar_months', 'fixed_days')",
            name="ck_cycle_templates_duration_type",
        ),
        sa.CheckConstraint("duration_value >= 1 AND duration_value <= 730", name="ck_cycle_templates_duration_value"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_cycle_templates_status"),
    )
    op.create_index("ix_cycle_templates_organization_id", "cycle_templates", ["organization_id"])
    op.create_index(
        "ix_cycle_templates_org_status",
        "cycle_templates",
        ["organization_id", "status"],
    )

    op.add_column(
        "cycles",
        sa.Column("cycle_template_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "cycles",
        sa.Column("weekdays", postgresql.ARRAY(sa.Integer()), nullable=True),
    )
    op.add_column("cycles", sa.Column("lesson_count", sa.Integer(), nullable=True))
    op.add_column("cycles", sa.Column("unit_price_cents", sa.Integer(), nullable=True))
    op.add_column("cycles", sa.Column("subtotal_cents", sa.Integer(), nullable=True))
    op.add_column(
        "cycles",
        sa.Column("adjustment_cents", sa.Integer(), nullable=True, server_default="0"),
    )
    op.add_column("cycles", sa.Column("lesson_duration_minutes", sa.Integer(), nullable=True))
    op.add_column(
        "cycles",
        sa.Column("default_location_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("cycles", sa.Column("default_starts_time", sa.Time(), nullable=True))
    op.add_column("cycles", sa.Column("duration_type", sa.String(length=32), nullable=True))
    op.add_column("cycles", sa.Column("duration_value", sa.Integer(), nullable=True))
    op.add_column("cycles", sa.Column("weekly_frequency", sa.Integer(), nullable=True))
    op.add_column(
        "cycles",
        sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("cycles", sa.Column("idempotency_key", sa.String(length=64), nullable=True))

    op.create_foreign_key(
        "fk_cycles_cycle_template_id",
        "cycles",
        "cycle_templates",
        ["cycle_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_cycles_default_location_id",
        "cycles",
        "locations",
        ["default_location_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_cycles_cycle_template_id", "cycles", ["cycle_template_id"])
    op.create_index(
        "uq_cycles_org_idempotency",
        "cycles",
        ["organization_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # Existing rows remain legacy; new intelligent cycles set is_legacy=false in app.
    op.execute(sa.text("UPDATE cycles SET is_legacy = true"))


def downgrade() -> None:
    op.drop_index("uq_cycles_org_idempotency", table_name="cycles")
    op.drop_index("ix_cycles_cycle_template_id", table_name="cycles")
    op.drop_constraint("fk_cycles_default_location_id", "cycles", type_="foreignkey")
    op.drop_constraint("fk_cycles_cycle_template_id", "cycles", type_="foreignkey")
    for col in (
        "idempotency_key",
        "is_legacy",
        "weekly_frequency",
        "duration_value",
        "duration_type",
        "default_starts_time",
        "default_location_id",
        "lesson_duration_minutes",
        "adjustment_cents",
        "subtotal_cents",
        "unit_price_cents",
        "lesson_count",
        "weekdays",
        "cycle_template_id",
    ):
        op.drop_column("cycles", col)

    op.drop_index("ix_cycle_templates_org_status", table_name="cycle_templates")
    op.drop_index("ix_cycle_templates_organization_id", table_name="cycle_templates")
    op.drop_table("cycle_templates")
    op.drop_column("services", "default_duration_minutes")
