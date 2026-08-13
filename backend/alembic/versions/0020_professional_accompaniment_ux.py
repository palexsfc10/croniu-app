"""Professional segmentation, multi intake links, anamnesis snapshot, plan↔cycle.

Revision ID: 0020_professional_accompaniment_ux
Revises: 0019_client_intake_journey
Create Date: 2026-08-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_professional_accompaniment_ux"
down_revision: Union[str, None] = "0019_client_intake_journey"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("profession_code", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("profession_specialty", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("profession_other", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("use_cases", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "profession_onboarding_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.add_column(
        "organization_intake_links",
        sa.Column("name", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "organization_intake_links",
        sa.Column("purpose", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "organization_intake_links",
        sa.Column("form_kind", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "organization_intake_links",
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "organization_intake_links",
        sa.Column(
            "submissions_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    op.execute(
        """
        UPDATE organization_intake_links
        SET
          name = COALESCE(name, 'Link principal'),
          purpose = COALESCE(purpose, 'new_client'),
          form_kind = COALESCE(form_kind, 'physical_anamnesis')
        """
    )
    # Mark one primary per org (prefer active, then newest).
    op.execute(
        """
        WITH ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY organization_id
                   ORDER BY
                     CASE WHEN status = 'active' THEN 0 ELSE 1 END,
                     created_at DESC
                 ) AS rn
          FROM organization_intake_links
        )
        UPDATE organization_intake_links l
        SET is_primary = true
        FROM ranked r
        WHERE l.id = r.id AND r.rn = 1
        """
    )

    op.add_column(
        "client_anamnesis_responses",
        sa.Column(
            "questions_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )

    op.add_column(
        "client_journeys",
        sa.Column("anamnesis_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "client_journeys",
        sa.Column("preparation_status", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "client_journeys",
        sa.Column(
            "accompaniment_checklist",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )

    op.add_column(
        "protocols",
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_protocols_cycle_id",
        "protocols",
        "cycles",
        ["cycle_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_protocols_cycle_id", "protocols", ["cycle_id"])
    op.add_column("protocols", sa.Column("effective_from", sa.Date(), nullable=True))
    op.add_column(
        "protocols",
        sa.Column("activation_mode", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("protocols", "activation_mode")
    op.drop_column("protocols", "effective_from")
    op.drop_index("ix_protocols_cycle_id", table_name="protocols")
    op.drop_constraint("fk_protocols_cycle_id", "protocols", type_="foreignkey")
    op.drop_column("protocols", "cycle_id")

    op.drop_column("client_journeys", "accompaniment_checklist")
    op.drop_column("client_journeys", "preparation_status")
    op.drop_column("client_journeys", "anamnesis_reviewed_at")

    op.drop_column("client_anamnesis_responses", "questions_snapshot")

    op.drop_column("organization_intake_links", "submissions_count")
    op.drop_column("organization_intake_links", "is_primary")
    op.drop_column("organization_intake_links", "form_kind")
    op.drop_column("organization_intake_links", "purpose")
    op.drop_column("organization_intake_links", "name")

    op.drop_column("organizations", "profession_onboarding_done")
    op.drop_column("organizations", "use_cases")
    op.drop_column("organizations", "profession_other")
    op.drop_column("organizations", "profession_specialty")
    op.drop_column("organizations", "profession_code")
