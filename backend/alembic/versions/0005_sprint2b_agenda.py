"""Sprint 2B: organization timezone, locations, appointments.

Revision ID: 0005_sprint2b_agenda
Revises: 0004_password_reset
Create Date: 2026-07-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_sprint2b_agenda"
down_revision = "0004_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="America/Sao_Paulo",
        ),
    )

    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("address_detail", sa.String(length=500), nullable=True),
        sa.Column("map_url", sa.String(length=1000), nullable=True),
        sa.Column("meeting_url", sa.String(length=1000), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
    )
    op.create_index("ix_locations_organization_id", "locations", ["organization_id"])
    op.create_index(
        "ix_locations_org_status",
        "locations",
        ["organization_id", "status"],
    )

    op.create_table(
        "appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="scheduled"),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.CheckConstraint("ends_at > starts_at", name="ck_appointments_ends_after_starts"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["cycle_id"], ["cycles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_appointments_organization_id", "appointments", ["organization_id"])
    op.create_index("ix_appointments_client_id", "appointments", ["client_id"])
    op.create_index(
        "ix_appointments_org_starts",
        "appointments",
        ["organization_id", "starts_at"],
    )
    op.create_index(
        "ix_appointments_org_status_starts",
        "appointments",
        ["organization_id", "status", "starts_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_appointments_org_status_starts", table_name="appointments")
    op.drop_index("ix_appointments_org_starts", table_name="appointments")
    op.drop_index("ix_appointments_client_id", table_name="appointments")
    op.drop_index("ix_appointments_organization_id", table_name="appointments")
    op.drop_table("appointments")
    op.drop_index("ix_locations_org_status", table_name="locations")
    op.drop_index("ix_locations_organization_id", table_name="locations")
    op.drop_table("locations")
    op.drop_column("organizations", "timezone")
