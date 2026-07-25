from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClientAccessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    has_active_link: bool
    created_at: datetime | None = None
    last_used_at: datetime | None = None
    # Raw token only on create/rotate responses
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
    show_on_my_cycle: bool = True


class PaymentSettingsOut(BaseModel):
    holder_name: str | None = None
    pix_key_type: str | None = None
    pix_key: str | None = None
    instructions: str | None = None
    external_payment_url: str | None = None
    show_on_my_cycle: bool = True


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
    suggested_unit_price_cents: int | None
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
    configured: bool = False


class PublicCycleBlock(BaseModel):
    service_name: str
    status_summary: str
    starts_on: date
    ends_on: date
    renewal_on: date | None = None
    lesson_count: int | None = None
    remaining_planned_lessons: int | None = None
    value_cents: int | None = None
    payment_status: str
    renewal_request_status: str | None = None
    payment_report_status: str | None = None


class PublicMyCycleOut(BaseModel):
    professional_display_name: str
    client_first_name: str
    cycle: PublicCycleBlock | None = None
    empty_message: str | None = None
    payment_instructions: PublicPaymentInstructions
    can_request_renewal: bool = False
    can_report_payment: bool = False


class PublicRenewalOut(BaseModel):
    status: str
    message: str


class PublicPaymentReportOut(BaseModel):
    status: str
    message: str
    amount_cents: int
