from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.schemas.agenda import AppointmentOut


class ClientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("full_name")
    @classmethod
    def require_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Informe o nome do cliente.")
        return cleaned

    @field_validator("phone", "notes", mode="before")
    @classmethod
    def empty_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            return value.strip()
        return value


class ClientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(active|archived)$")


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    phone: str | None
    email: str | None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class ServiceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    default_duration_days: int = Field(default=30, ge=1, le=730)
    default_duration_minutes: int = Field(default=60, ge=15, le=480)
    default_price_cents: int | None = Field(default=None, ge=0, le=100_000_000)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    default_duration_days: int | None = Field(default=None, ge=1, le=730)
    default_duration_minutes: int | None = Field(default=None, ge=15, le=480)
    default_price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    status: str | None = Field(default=None, pattern="^(active|archived)$")


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    default_duration_days: int
    default_duration_minutes: int
    default_price_cents: int | None
    status: str
    created_at: datetime
    updated_at: datetime


class CycleCreate(BaseModel):
    client_id: UUID
    service_id: UUID
    starts_on: date
    ends_on: date
    value_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    notes: str | None = Field(default=None, max_length=2000)
    create_receivable: bool = True
    receivable_due_on: date | None = None

    @model_validator(mode="after")
    def ends_after_start(self) -> CycleCreate:
        if self.ends_on < self.starts_on:
            raise ValueError("A data de fim deve ser igual ou posterior ao início.")
        return self


class CycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    service_id: UUID
    cycle_template_id: UUID | None = None
    cycle_type: str
    status: str
    starts_on: date
    ends_on: date
    weekdays: list[int] | None = None
    lesson_count: int | None = None
    lessons_completed: int = 0
    lessons_remaining: int | None = None
    unit_price_cents: int | None = None
    subtotal_cents: int | None = None
    adjustment_cents: int | None = None
    value_cents: int | None
    lesson_duration_minutes: int | None = None
    default_location_id: UUID | None = None
    default_starts_time: str | None = None
    duration_type: str | None = None
    duration_value: int | None = None
    weekly_frequency: int | None = None
    is_legacy: bool = True
    duration_label: str | None = None
    notes: str | None
    last_contacted_at: datetime | None
    contact_confirmed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    client_name: str | None = None
    service_name: str | None = None
    days_remaining: int | None = None
    is_nearing_end: bool = False


class ReceivableCreate(BaseModel):
    cycle_id: UUID
    amount_cents: int = Field(ge=0, le=100_000_000)
    due_on: date
    notes: str | None = Field(default=None, max_length=2000)


class ReceivableMarkPaid(BaseModel):
    payment_method: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)


class ReceivableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cycle_id: UUID
    client_id: UUID
    amount_cents: int
    due_on: date
    status: str
    paid_at: datetime | None
    payment_method: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    client_name: str | None = None
    cycle_service_name: str | None = None


class WhatsAppPrepOut(BaseModel):
    cycle_id: UUID
    client_id: UUID
    client_name: str
    phone: str | None
    message: str
    wa_url: str | None
    can_open_whatsapp: bool


class ConfirmContactIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class PriorityActionOut(BaseModel):
    kind: str
    title: str
    subtitle: str
    href: str
    entity_id: UUID


class HomeSummaryOut(BaseModel):
    organization_id: UUID
    timezone: str
    local_today: date
    today_appointments: list[AppointmentOut] = Field(default_factory=list)
    cycles_nearing_end: list[CycleOut]
    renewals: list[CycleOut]
    pending_payments: list[ReceivableOut]
    renewal_requests: list[dict] = Field(default_factory=list)
    payment_reports_pending: list[dict] = Field(default_factory=list)
    priority_action: PriorityActionOut | None = None
    contextual_hint: str | None = None
    message: str
