from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

DEFAULT_ORG_TIMEZONE = "America/Sao_Paulo"
APPOINTMENT_STATUSES = ("scheduled", "completed", "no_show", "cancelled")
ACTIVE_APPOINTMENT_STATUSES = ("scheduled", "completed", "no_show")


class OrganizationPreferencesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    timezone: str
    local_today: date


class OrganizationTimezoneUpdate(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    address_detail: str | None = Field(default=None, max_length=500)
    map_url: str | None = Field(default=None, max_length=1000)
    meeting_url: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def require_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Informe o nome do local.")
        return cleaned

    @field_validator("address", "address_detail", "notes", mode="before")
    @classmethod
    def empty_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("map_url", "meeting_url", mode="before")
    @classmethod
    def validate_optional_url(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            HttpUrl(cleaned)
            return cleaned
        return value


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    address_detail: str | None = Field(default=None, max_length=500)
    map_url: str | None = Field(default=None, max_length=1000)
    meeting_url: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(active|archived)$")

    @field_validator("map_url", "meeting_url", mode="before")
    @classmethod
    def validate_optional_url(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            HttpUrl(cleaned)
            return cleaned
        return value


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    address: str | None
    address_detail: str | None
    map_url: str | None
    meeting_url: str | None
    notes: str | None
    status: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AppointmentCreate(BaseModel):
    client_id: UUID
    starts_at: datetime
    ends_at: datetime
    cycle_id: UUID | None = None
    service_id: UUID | None = None
    location_id: UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def ends_after_starts(self) -> AppointmentCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("O fim deve ser posterior ao início.")
        return self


class AppointmentUpdate(BaseModel):
    client_id: UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    cycle_id: UUID | None = None
    service_id: UUID | None = None
    location_id: UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(
        default=None, pattern="^(scheduled|completed|no_show|cancelled)$"
    )


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    client_id: UUID
    cycle_id: UUID | None
    service_id: UUID | None
    location_id: UUID | None
    title: str | None
    starts_at: datetime
    ends_at: datetime
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime
    client_name: str | None = None
    service_name: str | None = None
    location_name: str | None = None
    cycle_service_name: str | None = None


class AppointmentConflictItem(BaseModel):
    id: UUID
    client_name: str | None
    starts_at: datetime
    ends_at: datetime
    status: str


class DayAgendaOut(BaseModel):
    date: date
    timezone: str
    appointments: list[AppointmentOut]
    conflict_count: int = 0
