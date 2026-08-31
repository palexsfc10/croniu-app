from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.evaluations import PublicEvaluationOut


class ClientAccessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    has_active_link: bool
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    # Raw signed token only on create/rotate. GET reconstructs public_url without token.
    token: str | None = None
    public_path: str | None = None
    public_url: str | None = None
    wa_message_template: str | None = None


class PaymentSettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    holder_name: str | None = Field(default=None, max_length=200)
    pix_key_type: str | None = Field(default=None, pattern="^(cpf|cnpj|email|phone|random)$")
    pix_key: str | None = Field(default=None, max_length=320)
    instructions: str | None = Field(default=None, max_length=2000)
    external_payment_url: str | None = Field(default=None, max_length=2000)
    institution: str | None = Field(default=None, max_length=120)
    show_on_my_cycle: bool = True
    whatsapp_e164: str | None = Field(default=None, max_length=20)
    whatsapp_enabled: bool = False


class PaymentSettingsOut(BaseModel):
    holder_name: str | None = None
    pix_key_type: str | None = None
    pix_key: str | None = None
    instructions: str | None = None
    external_payment_url: str | None = None
    institution: str | None = None
    show_on_my_cycle: bool = True
    whatsapp_e164: str | None = None
    whatsapp_enabled: bool = False


class RenewalRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    source_cycle_id: UUID
    status: str
    requested_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    client_name: str | None = None
    service_name: str | None = None


class RenewalPrepareOut(BaseModel):
    client_id: UUID
    service_id: UUID | None
    cycle_template_id: UUID | None
    weekdays: list[int] | None
    duration_type: str | None
    duration_value: int | None
    pricing_mode: str = "per_lesson"
    suggested_unit_price_cents: int | None
    suggested_fixed_price_cents: int | None = None
    renewal_request_id: UUID


class PaymentReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    cycle_id: UUID
    receivable_id: UUID
    status: str
    amount_cents: int
    method_note: str | None = None
    notes: str | None = None
    rejection_reason: str | None = None
    reported_at: datetime
    confirmed_at: datetime | None = None
    rejected_at: datetime | None = None
    client_name: str | None = None
    has_proof: bool = False


class PaymentReportRejectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)


class PublicPaymentInstructions(BaseModel):
    holder_name: str | None = None
    pix_key_type: str | None = None
    pix_key: str | None = None
    instructions: str | None = None
    external_payment_url: str | None = None
    institution: str | None = None
    configured: bool = False


class PublicRenewalWhatsApp(BaseModel):
    """Contact for sending proof via WhatsApp — only during renewal."""

    available: bool = False
    whatsapp_url: str | None = None


class PublicCycleBlock(BaseModel):
    service_name: str
    status_summary: str
    starts_on: date
    ends_on: date
    renewal_on: date | None = None
    lesson_count: int | None = None
    lessons_completed: int = 0
    lessons_no_show: int = 0
    remaining_planned_lessons: int | None = None
    value_cents: int | None = None
    payment_status: str
    renewal_request_status: str | None = None
    payment_report_status: str | None = None


class PublicPlanOut(BaseModel):
    section_title: str
    title: str
    summary: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    milestones: list[str] = Field(default_factory=list)
    external_url: str | None = None
    external_title: str | None = None
    published_at: datetime | None = None


class PublicMyCycleOut(BaseModel):
    professional_display_name: str
    client_first_name: str
    cycle: PublicCycleBlock | None = None
    empty_message: str | None = None
    payment_instructions: PublicPaymentInstructions
    renewal_payment_instructions: PublicPaymentInstructions = Field(
        default_factory=PublicPaymentInstructions
    )
    renewal_whatsapp: PublicRenewalWhatsApp = Field(default_factory=PublicRenewalWhatsApp)
    can_request_renewal: bool = False
    can_report_payment: bool = False
    can_declare_renewal_payment: bool = False
    evaluations: list[PublicEvaluationOut] = Field(default_factory=list)
    plan: PublicPlanOut | None = None


class PublicRenewalOut(BaseModel):
    status: str
    message: str


class PublicPaymentReportOut(BaseModel):
    status: str
    message: str
    amount_cents: int
