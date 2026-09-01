"""Smart availability: deterministic free-slot calculation over a configured weekly journey.

Derived, read-only data — never a persisted reservation. The final authority for whether a
given time can actually be booked remains ``agenda_svc.find_conflicts`` at appointment-creation
time (AGENDA-004); this module only computes what to *suggest*.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.appointment import Appointment
from app.models.availability_schedule import AvailabilitySchedule
from app.schemas.availability import (
    AvailabilityDayOut,
    AvailabilityRangeOut,
    AvailabilitySettingsOut,
    AvailabilitySettingsUpdate,
    DayScheduleOut,
    SlotOut,
)
from app.services import agenda as agenda_svc
from app.services.auth import AuthError
from app.services.cycle_schedule import local_dt

DEFAULT_DURATION_MINUTES = 60
MAX_AVAILABILITY_RANGE_DAYS = 31


@dataclass(frozen=True)
class BusyInterval:
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class Slot:
    starts_at: datetime
    ends_at: datetime


def _weekday_rows(db: Session, *, organization_id: uuid.UUID) -> dict[int, AvailabilitySchedule]:
    rows = db.scalars(
        select(AvailabilitySchedule).where(
            AvailabilitySchedule.organization_id == organization_id
        )
    ).all()
    return {row.weekday: row for row in rows}


def get_settings(db: Session, *, organization_id: uuid.UUID) -> AvailabilitySettingsOut:
    by_weekday = _weekday_rows(db, organization_id=organization_id)
    if not by_weekday:
        return AvailabilitySettingsOut(configured=False, days=[])
    days = [DayScheduleOut.model_validate(by_weekday[wd]) for wd in sorted(by_weekday)]
    return AvailabilitySettingsOut(configured=True, days=days)


def update_settings(
    db: Session,
    *,
    organization_id: uuid.UUID,
    role: str,
    payload: AvailabilitySettingsUpdate,
) -> AvailabilitySettingsOut:
    if role not in {"owner", "admin"}:
        raise AuthError(
            "forbidden",
            "Apenas administradores da organização podem configurar horários de atendimento.",
            status_code=403,
        )
    existing = _weekday_rows(db, organization_id=organization_id)
    for day in payload.days:
        row = existing.get(day.weekday)
        if row is None:
            row = AvailabilitySchedule(organization_id=organization_id, weekday=day.weekday)
            db.add(row)
        row.is_active = day.is_active
        row.starts_time = day.starts_time
        row.ends_time = day.ends_time
        row.break_starts_time = day.break_starts_time
        row.break_ends_time = day.break_ends_time
        row.default_duration_minutes = day.default_duration_minutes
    db.commit()
    return get_settings(db, organization_id=organization_id)


def _fetch_busy(
    db: Session,
    *,
    organization_id: uuid.UUID,
    range_start_utc: datetime,
    range_end_utc: datetime,
) -> list[BusyInterval]:
    rows = db.scalars(
        select(Appointment).where(
            Appointment.organization_id == organization_id,
            Appointment.status != "cancelled",
            Appointment.starts_at < range_end_utc,
            Appointment.ends_at > range_start_utc,
        )
    ).all()
    return [BusyInterval(starts_at=row.starts_at, ends_at=row.ends_at) for row in rows]


def _resolve_duration(
    explicit_minutes: int | None, journey: AvailabilitySchedule | None
) -> int:
    if explicit_minutes is not None:
        return explicit_minutes
    if journey is not None:
        return journey.default_duration_minutes
    return DEFAULT_DURATION_MINUTES


def compute_free_slots(
    *,
    day: date,
    journey: AvailabilitySchedule | None,
    busy: list[BusyInterval],
    tz: ZoneInfo,
    duration_minutes: int,
    now_utc: datetime | None = None,
) -> list[Slot]:
    """Pure calculation: journey window minus break minus busy intervals, stepped by duration.

    Step strategy (documented limitation): the step equals the requested/default duration —
    slots do not slide at a finer grain, so a free window that would fit the duration but
    isn't aligned to a step boundary may not be offered. Semi-open intervals [start, end)
    throughout, matching ``agenda_svc.find_conflicts``.
    """
    if journey is None or not journey.is_active:
        return []
    step = timedelta(minutes=duration_minutes)
    journey_start = local_dt(day, journey.starts_time, tz)
    journey_end = local_dt(day, journey.ends_time, tz)
    break_start = (
        local_dt(day, journey.break_starts_time, tz) if journey.break_starts_time else None
    )
    break_end = local_dt(day, journey.break_ends_time, tz) if journey.break_ends_time else None
    now = now_utc if now_utc is not None else datetime.now(UTC)

    slots: list[Slot] = []
    cursor = journey_start
    while cursor + step <= journey_end:
        slot_end = cursor + step
        if cursor < now:
            cursor += step
            continue
        overlaps_break = (
            break_start is not None
            and break_end is not None
            and cursor < break_end
            and slot_end > break_start
        )
        overlaps_busy = any(
            cursor < b.ends_at and slot_end > b.starts_at for b in busy
        )
        if not overlaps_break and not overlaps_busy:
            slots.append(Slot(starts_at=cursor, ends_at=slot_end))
        cursor += step
    return slots


def _slot_to_out(slot: Slot, tz: ZoneInfo) -> SlotOut:
    local_start = slot.starts_at.astimezone(tz)
    return SlotOut(starts_at=slot.starts_at, ends_at=slot.ends_at, label=local_start.strftime("%H:%M"))


def compute_day(
    db: Session,
    *,
    organization_id: uuid.UUID,
    day: date,
    duration_minutes: int | None = None,
) -> AvailabilityDayOut:
    org = agenda_svc.get_organization(db, organization_id)
    tz_name = agenda_svc.get_org_timezone(org)
    tz = ZoneInfo(tz_name)
    by_weekday = _weekday_rows(db, organization_id=organization_id)
    configured = bool(by_weekday)
    journey = by_weekday.get(day.weekday())
    resolved_duration = _resolve_duration(duration_minutes, journey)

    slots: list[Slot] = []
    if journey is not None and journey.is_active:
        start_utc, end_utc = agenda_svc.day_bounds_utc(day, tz_name)
        busy = _fetch_busy(
            db, organization_id=organization_id, range_start_utc=start_utc, range_end_utc=end_utc
        )
        slots = compute_free_slots(
            day=day,
            journey=journey,
            busy=busy,
            tz=tz,
            duration_minutes=resolved_duration,
        )

    return AvailabilityDayOut(
        date=day,
        weekday=day.weekday(),
        timezone=tz_name,
        configured=configured,
        is_active=bool(journey is not None and journey.is_active),
        duration_minutes=resolved_duration,
        slots=[_slot_to_out(s, tz) for s in slots],
    )


def compute_range(
    db: Session,
    *,
    organization_id: uuid.UUID,
    start_date: date,
    end_date: date,
    duration_minutes: int | None = None,
) -> AvailabilityRangeOut:
    if end_date < start_date:
        raise AuthError(
            "invalid_range", "A data final deve ser igual ou posterior à inicial.", 422
        )
    span_days = (end_date - start_date).days + 1
    if span_days > MAX_AVAILABILITY_RANGE_DAYS:
        raise AuthError(
            "date_range_limited",
            f"Consulta limitada a {MAX_AVAILABILITY_RANGE_DAYS} dias.",
            400,
        )

    org = agenda_svc.get_organization(db, organization_id)
    tz_name = agenda_svc.get_org_timezone(org)
    tz = ZoneInfo(tz_name)
    by_weekday = _weekday_rows(db, organization_id=organization_id)
    configured = bool(by_weekday)

    range_start_utc, _ = agenda_svc.day_bounds_utc(start_date, tz_name)
    _, range_end_utc = agenda_svc.day_bounds_utc(end_date, tz_name)
    busy = (
        _fetch_busy(
            db,
            organization_id=organization_id,
            range_start_utc=range_start_utc,
            range_end_utc=range_end_utc,
        )
        if configured
        else []
    )

    days_out: list[AvailabilityDayOut] = []
    top_level_duration = duration_minutes or DEFAULT_DURATION_MINUTES
    cursor_day = start_date
    while cursor_day <= end_date:
        journey = by_weekday.get(cursor_day.weekday())
        resolved_duration = _resolve_duration(duration_minutes, journey)
        slots: list[Slot] = []
        if journey is not None and journey.is_active:
            slots = compute_free_slots(
                day=cursor_day,
                journey=journey,
                busy=busy,
                tz=tz,
                duration_minutes=resolved_duration,
            )
        days_out.append(
            AvailabilityDayOut(
                date=cursor_day,
                weekday=cursor_day.weekday(),
                timezone=tz_name,
                configured=configured,
                is_active=bool(journey is not None and journey.is_active),
                duration_minutes=resolved_duration,
                slots=[_slot_to_out(s, tz) for s in slots],
            )
        )
        cursor_day += timedelta(days=1)

    return AvailabilityRangeOut(
        timezone=tz_name,
        configured=configured,
        duration_minutes=duration_minutes or top_level_duration,
        days=days_out,
    )
