from __future__ import annotations

from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CycleTemplateCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    weekly_frequency: int = Field(ge=1, le=7)
    duration_type: str = Field(pattern="^(calendar_months|fixed_days)$")
    duration_value: int = Field(ge=1, le=730)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Informe o nome do modelo.")
        return cleaned


class CycleTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    weekly_frequency: int | None = Field(default=None, ge=1, le=7)
    duration_type: str | None = Field(default=None, pattern="^(calendar_months|fixed_days)$")
    duration_value: int | None = Field(default=None, ge=1, le=730)
    status: str | None = Field(default=None, pattern="^(active|archived)$")


class CycleTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    weekly_frequency: int
    duration_type: str
    duration_value: int
    status: str
    created_at: datetime
    updated_at: datetime
    duration_label: str | None = None


class CyclePreviewIn(BaseModel):
    service_id: UUID
    cycle_template_id: UUID | None = None
    starts_on: date
    weekdays: list[int] = Field(min_length=1, max_length=7)
    duration_type: str | None = Field(default=None, pattern="^(calendar_months|fixed_days)$")
    duration_value: int | None = Field(default=None, ge=1, le=730)
    unit_price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    adjustment_cents: int | None = Field(default=None, ge=-100_000_000, le=100_000_000)
    final_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    lesson_duration_minutes: int | None = Field(default=None, ge=15, le=480)

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, value: list[int]) -> list[int]:
        cleaned = sorted({int(v) for v in value})
        if not cleaned or any(v < 0 or v > 6 for v in cleaned):
            raise ValueError("Informe dias da semana válidos (0=seg … 6=dom).")
        return cleaned

    @model_validator(mode="after")
    def require_duration(self) -> CyclePreviewIn:
        if self.cycle_template_id is None and (
            self.duration_type is None or self.duration_value is None
        ):
            raise ValueError("Informe o modelo de ciclo ou o tipo/valor de duração.")
        if self.adjustment_cents is not None and self.final_cents is not None:
            raise ValueError("Informe desconto/ajuste ou valor final, não ambos.")
        return self


class CyclePreviewOut(BaseModel):
    starts_on: date
    ends_on: date
    weekdays: list[int]
    lesson_dates: list[date]
    lesson_count: int
    unit_price_cents: int
    subtotal_cents: int
    adjustment_cents: int
    final_cents: int
    lesson_duration_minutes: int
    duration_type: str
    duration_value: int
    weekly_frequency: int


class IntelligentCycleCreate(BaseModel):
    client_id: UUID
    service_id: UUID
    cycle_template_id: UUID
    starts_on: date
    weekdays: list[int] = Field(min_length=1, max_length=7)
    unit_price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    adjustment_cents: int | None = Field(default=None, ge=-100_000_000, le=100_000_000)
    final_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    lesson_duration_minutes: int | None = Field(default=None, ge=15, le=480)
    notes: str | None = Field(default=None, max_length=2000)
    create_receivable: bool = True
    receivable_due_on: date | None = None
    # Intelligent cycles always materialize the agenda (invariant: active cycle ↔ appointments).
    generate_appointments: bool = True
    location_id: UUID | None = None
    starts_time: time | None = None
    idempotency_key: str | None = Field(default=None, min_length=4, max_length=64)
    renewal_request_id: UUID | None = None

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, value: list[int]) -> list[int]:
        cleaned = sorted({int(v) for v in value})
        if not cleaned or any(v < 0 or v > 6 for v in cleaned):
            raise ValueError("Informe dias da semana válidos (0=seg … 6=dom).")
        return cleaned

    @model_validator(mode="after")
    def validate_combo(self) -> IntelligentCycleCreate:
        if self.adjustment_cents is not None and self.final_cents is not None:
            raise ValueError("Informe desconto/ajuste ou valor final, não ambos.")
        if not self.generate_appointments:
            raise ValueError(
                "Ciclo com programação deve gerar as aulas na agenda. "
                "Não é permitido criar ciclo ativo sem compromissos."
            )
        if self.starts_time is None:
            raise ValueError("Informe o horário para gerar as aulas na agenda.")
        if len(self.weekdays) == 0:
            raise ValueError("Selecione ao menos um dia da semana.")
        return self


class IntelligentCycleUpdate(BaseModel):
    """Contractual/financial edit only — does not sync existing appointments."""

    model_config = ConfigDict(extra="forbid")

    notes: str | None = Field(default=None, max_length=2000)
    # Accepted only to return a stable domain code (snapshot_immutable); never applied.
    unit_price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    adjustment_cents: int | None = Field(default=None, ge=-100_000_000, le=100_000_000)
    final_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    starts_on: date | None = None
    cycle_template_id: UUID | None = None
    service_id: UUID | None = None
    lesson_duration_minutes: int | None = Field(default=None, ge=15, le=480)
    default_location_id: UUID | None = None
    default_starts_time: time | None = None

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        cleaned = sorted({int(v) for v in value})
        if not cleaned or any(v < 0 or v > 6 for v in cleaned):
            raise ValueError("Informe dias da semana válidos (0=seg … 6=dom).")
        return cleaned

    @model_validator(mode="after")
    def validate_combo(self) -> IntelligentCycleUpdate:
        if self.adjustment_cents is not None and self.final_cents is not None:
            raise ValueError("Informe desconto/ajuste ou valor final, não ambos.")
        return self


class FinancialCycleUpdate(BaseModel):
    """Financial-only edit: discount/adjustment XOR final total. Snapshot unit price immutable."""

    model_config = ConfigDict(extra="forbid")

    adjustment_cents: int | None = Field(default=None, ge=-100_000_000, le=100_000_000)
    final_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_combo(self) -> FinancialCycleUpdate:
        has_adj = self.adjustment_cents is not None
        has_final = self.final_cents is not None
        if has_adj and has_final:
            raise ValueError("Informe desconto/ajuste ou valor final, não ambos.")
        if not has_adj and not has_final and self.notes is None:
            raise ValueError("Informe desconto/ajuste, valor final ou observação.")
        if has_adj or has_final:
            return self
        return self
