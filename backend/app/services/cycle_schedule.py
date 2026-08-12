"""Shared cycle schedule: occurrences, conflicts, availability, atomic create."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.receivable import Receivable
from app.services import agenda as agenda_svc
from app.services import domain as domain_svc
from app.services.auth import AuthError
from app.services.cycle_calc import compose_financial, compute_renewal_on, enumerate_lesson_dates

WEEKDAY_LABELS_PT = (
    "segunda",
    "terça",
    "quarta",
    "quinta",
    "sexta",
    "sábado",
    "domingo",
)
WEEKDAY_LABELS_PLURAL = (
    "segundas",
    "terças",
    "quartas",
    "quintas",
    "sextas",
    "sábados",
    "domingos",
)


@dataclass(frozen=True)
class ScheduleSlot:
    weekday: int  # Mon=0 … Sun=6
    starts_time: time


@dataclass(frozen=True)
class Occurrence:
    day: date
    weekday: int
    starts_at: datetime
    ends_at: datetime
    index: int  # 1-based


@dataclass
class ConflictHit:
    occurrence: Occurrence
    conflicting: list[Appointment]


def org_timezone(db: Session, organization_id: uuid.UUID) -> ZoneInfo:
    from app.models.organization import Organization

    org = db.get(Organization, organization_id)
    name = (org.timezone if org else None) or "America/Sao_Paulo"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("America/Sao_Paulo")


def local_dt(day: date, starts_time: time, tz: ZoneInfo) -> datetime:
    return datetime(
        day.year,
        day.month,
        day.day,
        starts_time.hour,
        starts_time.minute,
        starts_time.second,
        tzinfo=tz,
    )


def parse_hhmm(value: str | time) -> time:
    if isinstance(value, time):
        return value.replace(tzinfo=None)
    raw = value.strip()
    parts = raw.split(":")
    if len(parts) < 2:
        raise ValueError(f"Horário inválido: {value}")
    hour = int(parts[0])
    minute = int(parts[1])
    second = int(parts[2]) if len(parts) > 2 else 0
    return time(hour, minute, second)


def slots_from_payload(
    weekdays: list[int],
    *,
    starts_time: time | str | None = None,
    schedule_slots: list[dict[str, Any]] | None = None,
) -> list[ScheduleSlot]:
    """Build per-weekday slots. schedule_slots wins; else same starts_time for all days."""
    if schedule_slots:
        out: list[ScheduleSlot] = []
        for raw in schedule_slots:
            wd = int(raw["weekday"])
            st = parse_hhmm(raw["starts_time"])
            out.append(ScheduleSlot(weekday=wd, starts_time=st))
        by_day = {s.weekday: s for s in out}
        missing = [d for d in weekdays if d not in by_day]
        if missing:
            raise AuthError(
                "schedule_incomplete",
                "Informe o horário para todos os dias da programação.",
                422,
                details={"missing_weekdays": missing},
            )
        return [by_day[d] for d in sorted(set(weekdays))]
    if starts_time is None:
        raise AuthError(
            "missing_starts_time",
            "Informe o horário das aulas.",
            422,
        )
    st = parse_hhmm(starts_time)
    return [ScheduleSlot(weekday=d, starts_time=st) for d in sorted(set(weekdays))]


def build_occurrences(
    *,
    starts_on: date,
    ends_on: date,
    slots: list[ScheduleSlot],
    duration_minutes: int,
    tz: ZoneInfo,
) -> list[Occurrence]:
    weekdays = [s.weekday for s in slots]
    times = {s.weekday: s.starts_time for s in slots}
    days = enumerate_lesson_dates(starts_on=starts_on, ends_on=ends_on, weekdays=weekdays)
    duration = timedelta(minutes=duration_minutes)
    out: list[Occurrence] = []
    for i, day in enumerate(days, start=1):
        st = times[day.weekday()]
        start_at = local_dt(day, st, tz)
        out.append(
            Occurrence(
                day=day,
                weekday=day.weekday(),
                starts_at=start_at,
                ends_at=start_at + duration,
                index=i,
            )
        )
    return out


def find_occurrence_conflicts(
    db: Session,
    *,
    organization_id: uuid.UUID,
    occurrences: list[Occurrence],
    exclude_cycle_id: uuid.UUID | None = None,
) -> list[ConflictHit]:
    hits: list[ConflictHit] = []
    for occ in occurrences:
        rows = agenda_svc.find_conflicts(
            db,
            organization_id=organization_id,
            starts_at=occ.starts_at,
            ends_at=occ.ends_at,
            exclude_cycle_id=exclude_cycle_id,
        )
        if rows:
            hits.append(ConflictHit(occurrence=occ, conflicting=rows))
    # Internal batch overlaps
    for i, a in enumerate(occurrences):
        for b in occurrences[i + 1 :]:
            if a.starts_at < b.ends_at and a.ends_at > b.starts_at:
                hits.append(ConflictHit(occurrence=a, conflicting=[]))
                break
    return hits


def format_time_range(starts_at: datetime, ends_at: datetime, tz: ZoneInfo) -> str:
    local_s = starts_at.astimezone(tz)
    local_e = ends_at.astimezone(tz)
    return f"{local_s.strftime('%H:%M')}–{local_e.strftime('%H:%M')}"


def format_schedule_lines(slots: list[ScheduleSlot], duration_minutes: int) -> list[str]:
    lines: list[str] = []
    for slot in slots:
        end_h = (
            datetime.combine(date(2000, 1, 1), slot.starts_time)
            + timedelta(minutes=duration_minutes)
        ).time()
        label = WEEKDAY_LABELS_PLURAL[slot.weekday]
        lines.append(
            f"{label}, {slot.starts_time.strftime('%H:%M')}–{end_h.strftime('%H:%M')}"
        )
    return lines


def format_occurrence_label(occ: Occurrence, tz: ZoneInfo) -> str:
    local = occ.starts_at.astimezone(tz)
    day_name = WEEKDAY_LABELS_PT[occ.weekday]
    return (
        f"{day_name}, {local.day:02d}/{local.month:02d}/{local.year} "
        f"{format_time_range(occ.starts_at, occ.ends_at, tz)}"
    )


def suggest_recurring_times(
    db: Session,
    *,
    organization_id: uuid.UUID,
    starts_on: date,
    ends_on: date,
    weekdays: list[int],
    duration_minutes: int,
    tz: ZoneInfo,
    preferred: time,
    window_start: time = time(6, 0),
    window_end: time = time(22, 0),
    step_minutes: int = 30,
    limit: int = 5,
) -> list[str]:
    """Suggest times free on ALL occurrence days (true recurring availability)."""
    days = enumerate_lesson_dates(starts_on=starts_on, ends_on=ends_on, weekdays=weekdays)
    if not days:
        return []
    duration = timedelta(minutes=duration_minutes)
    candidates: list[time] = []
    # Prefer near preferred, then scan window
    offsets = [0]
    for step in range(step_minutes, 12 * 60, step_minutes):
        offsets.extend([step, -step])
    seen: set[tuple[int, int]] = set()
    ordered: list[time] = []
    base = datetime.combine(date(2000, 1, 1), preferred)
    for off in offsets:
        cand_dt = base + timedelta(minutes=off)
        cand = cand_dt.time().replace(second=0, microsecond=0)
        key = (cand.hour, cand.minute)
        if key in seen:
            continue
        if cand < window_start or cand > window_end:
            continue
        # end within window
        end_t = (cand_dt + duration).time()
        if end_t > window_end and cand_dt.date() == date(2000, 1, 1):
            # still allow if ends same day past window slightly — skip strict
            pass
        seen.add(key)
        ordered.append(cand)

    suggestions: list[str] = []
    for cand in ordered:
        free = True
        for day in days:
            start_at = local_dt(day, cand, tz)
            end_at = start_at + duration
            if agenda_svc.find_conflicts(
                db,
                organization_id=organization_id,
                starts_at=start_at,
                ends_at=end_at,
            ):
                free = False
                break
        if free:
            end_t = (
                datetime.combine(date(2000, 1, 1), cand) + duration
            ).time()
            suggestions.append(f"{cand.strftime('%H:%M')}–{end_t.strftime('%H:%M')}")
            if len(suggestions) >= limit:
                break
    return suggestions


def create_cycle_with_schedule(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    service_id: uuid.UUID,
    starts_on: date,
    weekdays: list[int],
    schedule_slots: list[dict[str, Any]] | None = None,
    starts_time: time | str | None = None,
    duration_type: str = "fixed_days",
    duration_value: int = 30,
    cycle_template_id: uuid.UUID | None = None,
    value_cents: int | None = None,
    unit_price_cents: int | None = None,
    adjustment_cents: int | None = None,
    final_cents: int | None = None,
    lesson_duration_minutes: int | None = None,
    notes: str | None = None,
    create_receivable: bool = True,
    receivable_due_on: date | None = None,
    location_id: uuid.UUID | None = None,
    idempotency_key: str | None = None,
    generate_appointments: bool = True,
) -> tuple[Cycle, list[Appointment]]:
    """Atomically create cycle (+ receivable) and materialize agenda appointments."""
    if not generate_appointments:
        raise AuthError(
            "agenda_required",
            "Ciclo com programação deve gerar as aulas na agenda. "
            "Não é permitido criar ciclo ativo sem compromissos.",
            422,
        )
    if idempotency_key:
        existing = db.scalar(
            select(Cycle).where(
                Cycle.organization_id == organization_id,
                Cycle.idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            appts = list(
                db.scalars(
                    select(Appointment).where(
                        Appointment.organization_id == organization_id,
                        Appointment.cycle_id == existing.id,
                    )
                ).all()
            )
            return (
                domain_svc.get_cycle(
                    db, organization_id=organization_id, cycle_id=existing.id
                ),
                appts,
            )

    client = domain_svc.get_client(
        db, organization_id=organization_id, client_id=client_id
    )
    if client.status != "active":
        raise AuthError("client_archived", "Não é possível criar ciclo para cliente arquivado.")
    service = domain_svc.get_service(
        db, organization_id=organization_id, service_id=service_id
    )
    if service.status != "active":
        raise AuthError("service_archived", "Não é possível criar ciclo com serviço arquivado.")

    template = None
    weekly_frequency = len(sorted(set(weekdays)))
    if cycle_template_id is not None:
        from app.services import cycle_intelligence as ci_svc

        template = ci_svc.get_template(
            db, organization_id=organization_id, template_id=cycle_template_id
        )
        if template.status != "active":
            raise AuthError("template_archived", "Não é possível usar um modelo arquivado.")
        duration_type = template.duration_type
        duration_value = template.duration_value
        weekly_frequency = template.weekly_frequency
        if len(sorted(set(weekdays))) != template.weekly_frequency:
            raise AuthError(
                "weekday_mismatch",
                f"Selecione exatamente {template.weekly_frequency} dia(s) da semana.",
                422,
            )

    ends_on = compute_renewal_on(
        starts_on=starts_on, duration_type=duration_type, duration_value=duration_value
    )
    slots = slots_from_payload(
        weekdays, starts_time=starts_time, schedule_slots=schedule_slots
    )
    duration_minutes = (
        lesson_duration_minutes
        or service.default_duration_minutes
        or 60
    )
    tz = org_timezone(db, organization_id)
    occurrences = build_occurrences(
        starts_on=starts_on,
        ends_on=ends_on,
        slots=slots,
        duration_minutes=duration_minutes,
        tz=tz,
    )
    if not occurrences:
        raise AuthError(
            "no_lessons",
            "Nenhuma aula cai neste período com os dias escolhidos.",
            422,
        )

    unit = unit_price_cents if unit_price_cents is not None else (service.default_price_cents or 0)
    # Prefer explicit package total from assistant when provided as value_cents/final_cents
    money_final = final_cents if final_cents is not None else value_cents
    try:
        money = compose_financial(
            lesson_count=len(occurrences),
            unit_price_cents=unit,
            adjustment_cents=adjustment_cents,
            final_cents=money_final,
        )
    except ValueError as exc:
        raise AuthError("invalid_financial", str(exc), 422) from exc

    location = None
    if location_id is not None:
        location = agenda_svc.get_location(
            db, organization_id=organization_id, location_id=location_id
        )

    planned_appts: list[Appointment] = []
    if generate_appointments:
        hits = find_occurrence_conflicts(
            db, organization_id=organization_id, occurrences=occurrences
        )
        if hits:
            details = []
            for hit in hits:
                details.append(
                    {
                        "occurrence": format_occurrence_label(hit.occurrence, tz),
                        "starts_at": hit.occurrence.starts_at.isoformat(),
                        "ends_at": hit.occurrence.ends_at.isoformat(),
                        "conflicts": [
                            {
                                "id": str(c.id),
                                "client_name": c.client.full_name if c.client else None,
                                "starts_at": c.starts_at.isoformat(),
                                "ends_at": c.ends_at.isoformat(),
                                "status": c.status,
                            }
                            for c in hit.conflicting
                        ],
                    }
                )
            preferred = slots[0].starts_time
            alts = suggest_recurring_times(
                db,
                organization_id=organization_id,
                starts_on=starts_on,
                ends_on=ends_on,
                weekdays=weekdays,
                duration_minutes=duration_minutes,
                tz=tz,
                preferred=preferred,
            )
            raise AuthError(
                "appointment_conflict",
                "Há conflito de horário. Nenhum ciclo ou aula foi criado.",
                status_code=409,
                details={
                    "conflicts": details,
                    "conflict_count": len(hits),
                    "occurrence_count": len(occurrences),
                    "suggestions": alts,
                },
            )

    default_time = slots[0].starts_time if slots else None
    # Store first slot time; per-day variance lives in appointments
    cycle = Cycle(
        organization_id=organization_id,
        client_id=client.id,
        service_id=service.id,
        cycle_template_id=template.id if template else None,
        cycle_type="period",
        status="active",
        starts_on=starts_on,
        ends_on=ends_on,
        weekdays=sorted(set(weekdays)),
        lesson_count=money.lesson_count,
        unit_price_cents=money.unit_price_cents,
        subtotal_cents=money.subtotal_cents,
        adjustment_cents=money.adjustment_cents,
        value_cents=money.final_cents,
        lesson_duration_minutes=duration_minutes,
        default_location_id=location.id if location else None,
        default_starts_time=default_time,
        duration_type=duration_type,
        duration_value=duration_value,
        weekly_frequency=weekly_frequency,
        is_legacy=False,
        idempotency_key=idempotency_key,
        notes=domain_svc._normalize_optional_str(notes),
    )
    db.add(cycle)
    db.flush()

    if create_receivable and money.final_cents is not None:
        due = receivable_due_on or starts_on
        db.add(
            Receivable(
                organization_id=organization_id,
                cycle_id=cycle.id,
                client_id=client.id,
                amount_cents=money.final_cents,
                due_on=due,
                status="pending",
            )
        )

    title = f"{service.name} · {client.full_name}"
    for occ in occurrences:
        appt = Appointment(
            organization_id=organization_id,
            client_id=client.id,
            cycle_id=cycle.id,
            service_id=service.id,
            location_id=location.id if location else None,
            title=title,
            notes="Origem: ciclo",
            starts_at=occ.starts_at,
            ends_at=occ.ends_at,
            status="scheduled",
        )
        db.add(appt)
        planned_appts.append(appt)

    if len(planned_appts) != int(cycle.lesson_count or 0):
        db.rollback()
        raise AuthError(
            "agenda_incomplete",
            "A agenda gerada não corresponde à quantidade de aulas do ciclo.",
            500,
        )

    db.commit()
    cycle_out = domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)
    appt_ids = [a.id for a in planned_appts]
    planned_appts = list(
        db.scalars(
            select(Appointment).where(
                Appointment.organization_id == organization_id,
                Appointment.id.in_(appt_ids),
            )
        ).all()
    )
    return cycle_out, planned_appts
