"""Smart availability: per-organization weekly working-hours schedule.

Additive only: a brand-new table, org-scoped like `Location`/`Organization.timezone`.
No existing table, column, or row is touched. No journey is auto-created for existing
organizations — absence of rows for an organization means "not configured", handled
explicitly by app/services/availability.py, never treated as "available all day".

Revision ID: 0026_availability_schedules
Revises: 0025_user_auth_identities
Create Date: 2026-08-25
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026_availability_schedules"
down_revision: str | None = "0025_user_auth_identities"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "availability_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("starts_time", sa.Time(), nullable=False),
        sa.Column("ends_time", sa.Time(), nullable=False),
        sa.Column("break_starts_time", sa.Time(), nullable=True),
        sa.Column("break_ends_time", sa.Time(), nullable=True),
        sa.Column(
            "default_duration_minutes", sa.Integer(), nullable=False, server_default="60"
        ),
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
        sa.CheckConstraint(
            "weekday >= 0 AND weekday <= 6", name="ck_availability_schedules_weekday_range"
        ),
        sa.CheckConstraint(
            "ends_time > starts_time", name="ck_availability_schedules_ends_after_starts"
        ),
        sa.CheckConstraint(
            "(break_starts_time IS NULL) = (break_ends_time IS NULL)",
            name="ck_availability_schedules_break_pair",
        ),
        sa.CheckConstraint(
            "break_starts_time IS NULL OR break_ends_time > break_starts_time",
            name="ck_availability_schedules_break_ends_after_starts",
        ),
        sa.CheckConstraint(
            "break_starts_time IS NULL OR "
            "(break_starts_time >= starts_time AND break_ends_time <= ends_time)",
            name="ck_availability_schedules_break_within_journey",
        ),
        sa.CheckConstraint(
            "default_duration_minutes > 0", name="ck_availability_schedules_duration_positive"
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "organization_id", "weekday", name="uq_availability_schedules_org_weekday"
        ),
    )
    op.create_index(
        "ix_availability_schedules_organization_id",
        "availability_schedules",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_availability_schedules_organization_id", table_name="availability_schedules"
    )
    op.drop_table("availability_schedules")
