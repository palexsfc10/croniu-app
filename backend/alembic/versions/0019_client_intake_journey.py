"""Client intake journey, anamnesis, protocols, and routines.

Revision ID: 0019_client_intake_journey
Revises: 0018_email_verification
Create Date: 2026-08-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_client_intake_journey"
down_revision: str | None = "0018_email_verification"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organization_intake_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
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
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'disabled')",
            name="ck_organization_intake_links_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("token_hash", name="uq_organization_intake_links_token_hash"),
    )
    op.create_index(
        "ix_organization_intake_links_organization_id",
        "organization_intake_links",
        ["organization_id"],
    )

    op.create_table(
        "client_journeys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(64), nullable=False),
        sa.Column("evaluation_decision", sa.String(32), nullable=True),
        sa.Column("protocol_decision", sa.String(32), nullable=True),
        sa.Column(
            "requires_professional_attention",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("attention_note", sa.Text(), nullable=True),
        sa.Column("next_action", sa.String(64), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("client_id", name="uq_client_journeys_client_id"),
    )
    op.create_index("ix_client_journeys_organization_id", "client_journeys", ["organization_id"])
    op.create_index(
        "ix_client_journeys_org_stage",
        "client_journeys",
        ["organization_id", "stage"],
    )

    op.create_table(
        "client_intake_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("intake_link_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending_review"),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone_normalized", sa.String(32), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("primary_goal", sa.Text(), nullable=False),
        sa.Column("occupation", sa.String(200), nullable=True),
        sa.Column("emergency_contact", sa.String(200), nullable=True),
        sa.Column("initial_notes", sa.Text(), nullable=True),
        sa.Column("duplicate_client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("duplicate_alert", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("archived_match", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "requires_professional_attention",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("rejection_internal_reason", sa.Text(), nullable=True),
        sa.Column("message_to_client", sa.Text(), nullable=True),
        sa.Column("portal_access_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            "status IN ('pending_review', 'approved', 'rejected', 'changes_requested')",
            name="ck_client_intake_submissions_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["intake_link_id"], ["organization_intake_links.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["duplicate_client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["portal_access_id"], ["client_public_accesses.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "organization_id",
            "idempotency_key",
            name="uq_client_intake_submissions_org_idempotency",
        ),
    )
    op.create_index(
        "ix_client_intake_submissions_organization_id",
        "client_intake_submissions",
        ["organization_id"],
    )
    op.create_index(
        "ix_client_intake_submissions_intake_link_id",
        "client_intake_submissions",
        ["intake_link_id"],
    )
    op.create_index(
        "ix_client_intake_submissions_client_id",
        "client_intake_submissions",
        ["client_id"],
    )
    op.create_index(
        "ix_client_intake_submissions_org_status",
        "client_intake_submissions",
        ["organization_id", "status"],
    )

    op.create_table(
        "anamnesis_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column(
            "is_system_default", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
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
        sa.UniqueConstraint(
            "organization_id", "code", name="uq_anamnesis_templates_org_code"
        ),
    )
    op.create_index(
        "ix_anamnesis_templates_organization_id",
        "anamnesis_templates",
        ["organization_id"],
    )

    op.create_table(
        "anamnesis_template_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("schema_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["template_id"], ["anamnesis_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "template_id",
            "version_number",
            name="uq_anamnesis_template_versions_tpl_ver",
        ),
    )
    op.create_index(
        "ix_anamnesis_template_versions_template_id",
        "anamnesis_template_versions",
        ["template_id"],
    )

    op.create_table(
        "client_anamnesis_responses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("answers_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "requires_professional_attention",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["submission_id"], ["client_intake_submissions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["template_version_id"],
            ["anamnesis_template_versions.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "submission_id", name="uq_client_anamnesis_responses_submission"
        ),
    )
    op.create_index(
        "ix_client_anamnesis_responses_organization_id",
        "client_anamnesis_responses",
        ["organization_id"],
    )
    op.create_index(
        "ix_client_anamnesis_responses_client_id",
        "client_anamnesis_responses",
        ["client_id"],
    )

    op.create_table(
        "consent_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("consent_key", sa.String(64), nullable=False),
        sa.Column("text_version", sa.String(32), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False),
        sa.Column("purpose", sa.String(200), nullable=False),
        sa.Column("legal_basis", sa.String(64), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["submission_id"], ["client_intake_submissions.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_consent_records_organization_id", "consent_records", ["organization_id"])
    op.create_index("ix_consent_records_client_id", "consent_records", ["client_id"])
    op.create_index("ix_consent_records_submission_id", "consent_records", ["submission_id"])

    op.create_table(
        "protocols",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("protocol_type", sa.String(32), nullable=False, server_default="free"),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column(
            "is_org_template", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("review_due_on", sa.Date(), nullable=True),
        sa.Column("review_recurrence_days", sa.Integer(), nullable=True),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.Column("current_version_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            "status IN ('draft', 'ready', 'published', 'superseded', 'archived')",
            name="ck_protocols_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_protocols_organization_id", "protocols", ["organization_id"])
    op.create_index("ix_protocols_client_id", "protocols", ["client_id"])
    op.create_index("ix_protocols_org_status", "protocols", ["organization_id", "status"])

    op.create_table(
        "protocol_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("protocol_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("private_notes", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["protocol_id"], ["protocols.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "protocol_id", "version_number", name="uq_protocol_versions_proto_ver"
        ),
    )
    op.create_index("ix_protocol_versions_protocol_id", "protocol_versions", ["protocol_id"])
    op.create_index(
        "ix_protocol_versions_organization_id", "protocol_versions", ["organization_id"]
    )

    op.create_table(
        "recurring_client_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("task_type", sa.String(64), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("recurrence", sa.String(32), nullable=False, server_default="weekly"),
        sa.Column("lead_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filter_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("next_run_on", sa.Date(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("last_completed_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index(
        "ix_recurring_client_tasks_organization_id",
        "recurring_client_tasks",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_table("recurring_client_tasks")
    op.drop_table("protocol_versions")
    op.drop_table("protocols")
    op.drop_table("consent_records")
    op.drop_table("client_anamnesis_responses")
    op.drop_table("anamnesis_template_versions")
    op.drop_table("anamnesis_templates")
    op.drop_table("client_intake_submissions")
    op.drop_table("client_journeys")
    op.drop_table("organization_intake_links")
