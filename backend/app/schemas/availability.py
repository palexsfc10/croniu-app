from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

MIN_SLOT_DURATION_MINUTES = 15
MAX_SLOT_DURATION_MINUTES = 480


class DayScheduleIn(BaseModel):
    weekday: int = Field(ge=0, le=6)
    is_active: bool = True
    starts_time: time
    ends_time: time
    break_starts_time: time | None = None
    break_ends_time: time | None = None
    default_duration_minutes: int = Field(
        default=60, ge=MIN_SLOT_DURATION_MINUTES, le=MAX_SLOT_DURATION_MINUTES
    )

    @model_validator(mode="after")
    def validate_times(self) -> DayScheduleIn:
        if not self.is_active:
            return self
        if self.ends_time <= self.starts_time:
            raise ValueError("O fim deve ser posterior ao início.")
        if (self.break_starts_time is None) != (self.break_ends_time is None):
            raise ValueError("Informe início e fim do intervalo, ou nenhum dos dois.")
        if self.break_starts_time is not None:
            assert self.break_ends_time is not None
            if self.break_ends_time <= self.break_starts_time:
                raise ValueError("O intervalo deve terminar depois de começar.")
            if self.break_starts_time < self.starts_time or self.break_ends_time > self.ends_time:
                raise ValueError("O intervalo deve estar contido na jornada do dia.")
        return self


class AvailabilitySettingsUpdate(BaseModel):
    days: list[DayScheduleIn]

    @model_validator(mode="after")
    def validate_full_week(self) -> AvailabilitySettingsUpdate:
        weekdays = [d.weekday for d in self.days]
        if sorted(weekdays) != list(range(7)):
            raise ValueError(
                "Informe a configuração dos 7 dias da semana (0=segunda … 6=domingo), sem repetir."
            )
        return self


class DayScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int
    is_active: bool
    starts_time: time
    ends_time: time
    break_starts_time: time | None
    break_ends_time: time | None
    default_duration_minutes: int


class AvailabilitySettingsOut(BaseModel):
    configured: bool
    days: list[DayScheduleOut]


class SlotOut(BaseModel):
    starts_at: datetime
    ends_at: datetime
    label: str


class AvailabilityDayOut(BaseModel):
    date: date
    weekday: int
    timezone: str
    configured: bool
    is_active: bool
    duration_minutes: int
    slots: list[SlotOut]


class AvailabilityRangeOut(BaseModel):
    timezone: str
    configured: bool
    duration_minutes: int
    days: list[AvailabilityDayOut]
