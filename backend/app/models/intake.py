"""Client intake journey, anamnesis, protocols, and recurring routines."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class OrganizationIntakeLink(Base):
    """Permanent public intake link per organization (hash only; raw shown once)."""

    __tablename__ = "organization_intake_links"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_organization_intake_links_token_hash"),
        CheckConstraint(
            "status IN ('active', 'disabled')",
            name="ck_organization_intake_links_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    purpose: Mapped[str | None] = mapped_column(String(64), nullable=True)
    form_kind: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submissions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    template_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("anamnesis_template_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )


class ClientJourney(Base):
    """Explicit client operational journey stage (one row per client)."""

    __tablename__ = "client_journeys"
    __table_args__ = (
        UniqueConstraint("client_id", name="uq_client_journeys_client_id"),
        Index("ix_client_journeys_org_stage", "organization_id", "stage"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
    )
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    evaluation_decision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    protocol_decision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    requires_professional_attention: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    attention_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_action: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anamnesis_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    preparation_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accompaniment_checklist: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ClientIntakeSubmission(Base):
    __tablename__ = "client_intake_submissions"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "idempotency_key",
            name="uq_client_intake_submissions_org_idempotency",
        ),
        Index("ix_client_intake_submissions_org_status", "organization_id", "status"),
        CheckConstraint(
            "status IN ('pending_review', 'approved', 'rejected', 'changes_requested')",
            name="ck_client_intake_submissions_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    intake_link_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization_intake_links.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending_review")
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    primary_goal: Mapped[str] = mapped_column(Text, nullable=False)
    occupation: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(200), nullable=True)
    initial_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    duplicate_client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
    )
    duplicate_alert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived_match: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_professional_attention: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    rejection_internal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_to_client: Mapped[str | None] = mapped_column(Text, nullable=True)
    portal_access_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_public_accesses.id", ondelete="SET NULL"),
        nullable=True,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AnamnesisTemplate(Base):
    __tablename__ = "anamnesis_templates"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_anamnesis_templates_org_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    is_system_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    versions: Mapped[list[AnamnesisTemplateVersion]] = relationship(
        "AnamnesisTemplateVersion",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="AnamnesisTemplateVersion.version_number",
    )


class AnamnesisTemplateVersion(Base):
    __tablename__ = "anamnesis_template_versions"
    __table_args__ = (
        UniqueConstraint(
            "template_id", "version_number", name="uq_anamnesis_template_versions_tpl_ver"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("anamnesis_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    template: Mapped[AnamnesisTemplate] = relationship(
        "AnamnesisTemplate", back_populates="versions"
    )


class ClientAnamnesisResponse(Base):
    __tablename__ = "client_anamnesis_responses"
    __table_args__ = (
        UniqueConstraint("submission_id", name="uq_client_anamnesis_responses_submission"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_intake_submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("anamnesis_template_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    answers_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    questions_snapshot: Mapped[list | dict | None] = mapped_column(JSONB, nullable=True)
    requires_professional_attention: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_intake_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consent_key: Mapped[str] = mapped_column(String(64), nullable=False)
    text_version: Mapped[str] = mapped_column(String(32), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    purpose: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_basis: Mapped[str] = mapped_column(String(64), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Protocol(Base):
    __tablename__ = "protocols"
    __table_args__ = (
        Index("ix_protocols_org_status", "organization_id", "status"),
        CheckConstraint(
            "status IN ('draft', 'ready', 'published', 'superseded', 'archived')",
            name="ck_protocols_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    protocol_type: Mapped[str] = mapped_column(String(32), nullable=False, default="free")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    is_org_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    review_due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    review_recurrence_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    feedback_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_feedback_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_review_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_feedback_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    extension_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cycles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    activation_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    current_version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    versions: Mapped[list[ProtocolVersion]] = relationship(
        "ProtocolVersion",
        back_populates="protocol",
        cascade="all, delete-orphan",
        order_by="ProtocolVersion.version_number",
    )


class ProtocolVersion(Base):
    __tablename__ = "protocol_versions"
    __table_args__ = (
        UniqueConstraint("protocol_id", "version_number", name="uq_protocol_versions_proto_ver"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    protocol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("protocols.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    content_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    private_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    protocol: Mapped[Protocol] = relationship("Protocol", back_populates="versions")


class RecurringClientTask(Base):
    __tablename__ = "recurring_client_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurrence: Mapped[str] = mapped_column(String(32), nullable=False, default="weekly")
    lead_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filter_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    next_run_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    last_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class OperationalOccurrence(Base):
    __tablename__ = "operational_occurrences"
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_op_occ_org_idem"),
        Index("ix_op_occ_org_id", "organization_id"),
        Index("ix_op_occ_org_opdate", "organization_id", "operational_date"),
        Index("ix_op_occ_client_id", "client_id"),
        Index("ix_op_occ_protocol_id", "protocol_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True
    )
    protocol_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("protocols.id", ondelete="CASCADE"),
        nullable=True,
    )
    protocol_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("protocol_versions.id", ondelete="SET NULL"), nullable=True
    )
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cycles.id", ondelete="SET NULL"), nullable=True
    )
    occurrence_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    operational_date: Mapped[date] = mapped_column(Date, nullable=False)
    deferred_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="computed")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(180), nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

