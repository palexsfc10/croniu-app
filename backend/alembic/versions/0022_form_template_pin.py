"""Pin intake links to anamnesis template versions.

Revision ID: 0022_form_template_pin
Revises: 0021_plan_cadence
Create Date: 2026-08-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022_form_template_pin"
down_revision: Union[str, None] = "0021_plan_cadence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization_intake_links",
        sa.Column("template_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_org_intake_links_template_version",
        "organization_intake_links",
        "anamnesis_template_versions",
        ["template_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_organization_intake_links_template_version_id",
        "organization_intake_links",
        ["template_version_id"],
    )
    op.execute(
        """
        UPDATE organization_intake_links AS l
        SET template_version_id = v.id
        FROM anamnesis_template_versions AS v
        JOIN anamnesis_templates AS t ON t.id = v.template_id
        WHERE l.template_version_id IS NULL
          AND t.is_system_default IS TRUE
          AND t.organization_id IS NULL
          AND v.version_number = 1
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_organization_intake_links_template_version_id",
        table_name="organization_intake_links",
    )
    op.drop_constraint(
        "fk_org_intake_links_template_version",
        "organization_intake_links",
        type_="foreignkey",
    )
    op.drop_column("organization_intake_links", "template_version_id")
