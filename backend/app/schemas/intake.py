"""Pydantic schemas for client intake journey, protocols, and routines."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IntakeLinkOut(BaseModel):
    has_active_link: bool
    id: str | None = None
    status: str | None = None
    name: str | None = None
    purpose: str | None = None
    form_kind: str | None = None
    is_primary: bool = False
    submissions_count: int = 0
    created_at: datetime | None = None
    rotated_at: datetime | None = None
    last_used_at: datetime | None = None
    token: str | None = None
    public_path: str | None = None
    public_url: str | None = None
    wa_message_url: str | None = None


class IntakeLinkCreateIn(BaseModel):
    name: str = Field(default="Link de entrada", min_length=1, max_length=120)
    purpose: str = Field(default="new_client", max_length=64)
    form_kind: str = Field(default="physical_anamnesis", max_length=64)
    set_primary: bool = False


class PublicIntakeContextOut(BaseModel):
    professional_public_name: str
    welcome_message: str
    process_summary: str
    anamnesis_schema: dict[str, Any]
    template_version_id: str
    attention_client_message: str
    form_kind: str | None = None
    form_name: str | None = None
    nomenclature: dict[str, str] = Field(default_factory=dict)


class IntakeSubmitIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=8, max_length=32)
    email: str | None = None
    birth_date: date | None = None
    age_band: str | None = None
    primary_goal: str = Field(min_length=1)
    occupation: str | None = None
    emergency_contact: str | None = None
    initial_notes: str | None = None
    answers: dict[str, Any] = Field(default_factory=dict)
    consents: dict[str, bool] = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=64)
    # Intentionally ignored if sent:
    organization_id: UUID | None = None


class IntakeSubmitOut(BaseModel):
    submission_id: str
    client_id: str | None = None
    status: str
    requires_professional_attention: bool = False
    attention_message: str | None = None
    idempotent_replay: bool = False
    portal_token: str | None = None
    portal_path: str | None = None
    portal_url: str | None = None
    duplicate_alert: bool = False
    archived_match: bool = False


class IntakeSubmissionListItem(BaseModel):
    id: UUID
    client_id: UUID | None
    status: str
    full_name: str
    submitted_at: datetime | None
    requires_professional_attention: bool
    duplicate_alert: bool
    archived_match: bool
    primary_goal: str


class ConsentOut(BaseModel):
    consent_key: str
    text_version: str
    accepted: bool
    purpose: str
    legal_basis: str
    accepted_at: datetime


class AnamnesisQuestionSnapshot(BaseModel):
    id: str
    label: str
    section: str | None = None
    section_title: str | None = None
    type: str = "text"
    order: int = 0
    answer: Any = None
    answer_label: str | None = None
    attention: bool = False
    sensitive: bool = False
    help_text: str | None = None


class AnamnesisOut(BaseModel):
    id: UUID
    template_version_id: UUID
    answers_json: dict[str, Any]
    questions_snapshot: list[AnamnesisQuestionSnapshot] = Field(default_factory=list)
    form_name: str | None = None
    template_version_number: int | None = None
    summary: dict[str, Any] | None = None
    requires_professional_attention: bool
    created_at: datetime


class JourneyOut(BaseModel):
    id: UUID
    client_id: UUID
    stage: str
    stage_label: str
    evaluation_decision: str | None = None
    protocol_decision: str | None = None
    requires_professional_attention: bool = False
    attention_note: str | None = None
    next_action: str | None = None
    preparation_status: str | None = None
    accompaniment_checklist: dict[str, Any] | None = None
    anamnesis_reviewed_at: datetime | None = None
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    activated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class IntakeSubmissionDetailOut(BaseModel):
    id: UUID
    client_id: UUID | None
    status: str
    full_name: str
    phone_normalized: str
    email: str | None
    birth_date: date | None
    primary_goal: str
    occupation: str | None
    emergency_contact: str | None
    initial_notes: str | None
    duplicate_client_id: UUID | None
    duplicate_alert: bool
    archived_match: bool
    requires_professional_attention: bool
    rejection_internal_reason: str | None
    message_to_client: str | None
    submitted_at: datetime | None
    reviewed_at: datetime | None
    anamnesis: AnamnesisOut | None = None
    consents: list[ConsentOut] = Field(default_factory=list)
    journey: JourneyOut | None = None


class ApproveSubmissionIn(BaseModel):
    message_to_client: str | None = None
    evaluation_decision: str | None = None
    protocol_decision: str | None = None


class RequestChangesIn(BaseModel):
    message_to_client: str = Field(min_length=1)


class RejectSubmissionIn(BaseModel):
    rejection_internal_reason: str | None = None
    message_to_client: str | None = None


class EvaluationDecisionIn(BaseModel):
    decision: str


class ProtocolDecisionIn(BaseModel):
    decision: str


class PrepareStartOut(BaseModel):
    journey_stage: str
    evaluation_decision: str | None = None
    protocol_decision: str | None = None
    evaluation_ok: bool
    protocol_ok: bool
    attention_cleared: bool
    ready: bool


class AccompanimentChecklistIn(BaseModel):
    checklist: dict[str, Any]


class ProfessionOut(BaseModel):
    profession_code: str | None = None
    profession_specialty: str | None = None
    profession_other: str | None = None
    use_cases: list[str] | None = None
    profession_onboarding_done: bool = False
    recommended_form_kind: str = "simple_registration"
    nomenclature: dict[str, str] = Field(default_factory=dict)
    catalog: dict[str, Any] = Field(default_factory=dict)


class ProfessionUpdateIn(BaseModel):
    profession_code: str | None = None
    profession_specialty: str | None = None
    profession_other: str | None = None
    use_cases: list[str] | None = None
    profession_onboarding_done: bool | None = None


class PortalIntakeStatusOut(BaseModel):
    professional_public_name: str | None = None
    client_first_name: str | None = None
    journey_stage: str
    journey_label: str
    submission_status: str | None = None
    message_to_client: str | None = None
    requires_professional_attention: bool = False
    attention_message: str | None = None
    protocol: dict[str, Any] | None = None
    nomenclature: dict[str, str] = Field(default_factory=dict)


class ProtocolCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    protocol_type: str = "free"
    client_id: UUID | None = None
    content_json: dict[str, Any] = Field(default_factory=dict)
    private_notes: str | None = None
    is_org_template: bool = False
    cycle_id: UUID | None = None
    effective_from: date | None = None
    activation_mode: str | None = None


class ProtocolUpdateIn(BaseModel):
    title: str | None = None
    protocol_type: str | None = None
    content_json: dict[str, Any] | None = None
    private_notes: str | None = None
    cycle_id: UUID | None = None
    effective_from: date | None = None
    activation_mode: str | None = None


class ProtocolScheduleIn(BaseModel):
    review_due_on: date | None = None
    review_recurrence_days: int | None = None
    review_reason: str | None = None


class ProtocolDuplicateIn(BaseModel):
    client_id: UUID | None = None


class ProtocolVersionOut(BaseModel):
    id: UUID
    version_number: int
    status: str
    content_json: dict[str, Any]
    private_notes: str | None = None
    published_at: datetime | None = None
    created_at: datetime


class ProtocolOut(BaseModel):
    id: UUID
    client_id: UUID | None
    title: str
    protocol_type: str
    status: str
    is_org_template: bool
    review_due_on: date | None = None
    review_recurrence_days: int | None = None
    review_reason: str | None = None
    cycle_id: UUID | None = None
    effective_from: date | None = None
    activation_mode: str | None = None
    current_version_number: int
    created_at: datetime
    updated_at: datetime
    versions: list[ProtocolVersionOut] = Field(default_factory=list)


class RoutineCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    task_type: str
    recurrence: str = "weekly"
    weekday: int | None = None
    lead_days: int = 0
    filter_json: dict[str, Any] | None = None
    next_run_on: date | None = None


class RoutineUpdateIn(BaseModel):
    name: str | None = None
    task_type: str | None = None
    recurrence: str | None = None
    weekday: int | None = None
    lead_days: int | None = None
    filter_json: dict[str, Any] | None = None
    next_run_on: date | None = None
    status: str | None = None


class RoutineOut(BaseModel):
    id: UUID
    name: str
    task_type: str
    weekday: int | None
    recurrence: str
    lead_days: int
    filter_json: dict[str, Any] | None = None
    next_run_on: date | None
    status: str
    last_completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PlatformIntakeStatsOut(BaseModel):
    active_intake_links: int
    submissions_by_status: dict[str, int]
    submissions_total: int
