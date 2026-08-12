"""Cycle templates + intelligent cycle creation/preview/edit."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.cycle_template import CycleTemplate
from app.models.location import Location
from app.models.receivable import Receivable
from app.models.renewal_request import RenewalRequest
from app.schemas.cycle_intelligence import (
    CyclePreviewIn,
    CyclePreviewOut,
    CycleTemplateOut,
    FinancialCycleUpdate,
    IntelligentCycleCreate,
    IntelligentCycleUpdate,
)
from app.schemas.domain import CycleOut
from app.services import agenda as agenda_svc
from app.services import domain as domain_svc
from app.services.auth import AuthError
from app.services.cycle_calc import compose_financial, compute_renewal_on, enumerate_lesson_dates

# Shared financial policy for PATCH /intelligent and PATCH /financial (ADR-026).
FINANCIAL_INPUT_KEYS = frozenset({"adjustment_cents", "final_cents"})
STRUCTURAL_RECALC_KEYS = frozenset(
    {"weekdays", "starts_on", "cycle_template_id", "service_id"}
)
SNAPSHOT_IMMUTABLE_KEYS = frozenset(
    {
        "unit_price_cents",
        "unit_price_snapshot",
        "subtotal_cents",
        "lesson_count",
        "value_cents",
    }
)


def duration_label(duration_type: str, duration_value: int) -> str:
    if duration_type == "calendar_months":
        return "1 mês" if duration_value == 1 else f"{duration_value} meses"
    if duration_type == "fixed_days":
        return "1 dia" if duration_value == 1 else f"{duration_value} dias"
    return f"{duration_value}"


def template_to_out(row: CycleTemplate) -> CycleTemplateOut:
    return CycleTemplateOut(
        id=row.id,
        name=row.name,
        weekly_frequency=row.weekly_frequency,
        duration_type=row.duration_type,
        duration_value=row.duration_value,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
        duration_label=duration_label(row.duration_type, row.duration_value),
    )


def list_templates(
    db: Session, *, organization_id: uuid.UUID, status: str | None = "active"
) -> list[CycleTemplate]:
    query = select(CycleTemplate).where(CycleTemplate.organization_id == organization_id)
    if status:
        query = query.where(CycleTemplate.status == status)
    return list(db.scalars(query.order_by(CycleTemplate.name.asc())).all())


def get_template(
    db: Session, *, organization_id: uuid.UUID, template_id: uuid.UUID
) -> CycleTemplate:
    row = db.scalar(
        select(CycleTemplate).where(
            CycleTemplate.id == template_id,
            CycleTemplate.organization_id == organization_id,
        )
    )
    if row is None:
        raise AuthError("not_found", "Modelo de ciclo não encontrado.", 404)
    return row


def create_template(
    db: Session,
    *,
    organization_id: uuid.UUID,
    name: str,
    weekly_frequency: int,
    duration_type: str,
    duration_value: int,
) -> CycleTemplate:
    if weekly_frequency < 1 or weekly_frequency > 7:
        raise AuthError("invalid_frequency", "Frequência semanal inválida.", 422)
    row = CycleTemplate(
        organization_id=organization_id,
        name=name.strip(),
        weekly_frequency=weekly_frequency,
        duration_type=duration_type,
        duration_value=duration_value,
        status="active",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_template(
    db: Session,
    *,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    **fields: object,
) -> CycleTemplate:
    row = get_template(db, organization_id=organization_id, template_id=template_id)
    for key in ("name", "weekly_frequency", "duration_type", "duration_value", "status"):
        if key in fields and fields[key] is not None:
            value = fields[key]
            if key == "name":
                setattr(row, key, str(value).strip())
            else:
                setattr(row, key, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _resolve_duration(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_template_id: uuid.UUID | None,
    duration_type: str | None,
    duration_value: int | None,
    require_active_template: bool,
) -> tuple[CycleTemplate | None, str, int, int]:
    template: CycleTemplate | None = None
    if cycle_template_id is not None:
        template = get_template(db, organization_id=organization_id, template_id=cycle_template_id)
        if require_active_template and template.status != "active":
            raise AuthError(
                "template_archived",
                "Não é possível usar um modelo arquivado em novos ciclos.",
            )
        return (
            template,
            template.duration_type,
            template.duration_value,
            template.weekly_frequency,
        )
    if duration_type is None or duration_value is None:
        raise AuthError("missing_duration", "Informe tipo e valor de duração.", 422)
    return None, duration_type, duration_value, len([])  # weekly filled by caller


def build_preview(
    db: Session,
    *,
    organization_id: uuid.UUID,
    payload: CyclePreviewIn,
) -> CyclePreviewOut:
    service = domain_svc.get_service(
        db, organization_id=organization_id, service_id=payload.service_id
    )
    template, duration_type, duration_value, weekly_frequency = _resolve_duration(
        db,
        organization_id=organization_id,
        cycle_template_id=payload.cycle_template_id,
        duration_type=payload.duration_type,
        duration_value=payload.duration_value,
        require_active_template=False,
    )
    if template is not None:
        weekly_frequency = template.weekly_frequency
    else:
        weekly_frequency = len(payload.weekdays)

    if len(payload.weekdays) != weekly_frequency and template is not None:
        # Allow selecting exactly the template frequency; soft-check
        if len(payload.weekdays) < 1:
            raise AuthError("invalid_weekdays", "Selecione os dias da semana.", 422)

    ends_on = compute_renewal_on(
        starts_on=payload.starts_on,
        duration_type=duration_type,
        duration_value=duration_value,
    )
    try:
        lesson_dates = enumerate_lesson_dates(
            starts_on=payload.starts_on,
            ends_on=ends_on,
            weekdays=payload.weekdays,
        )
    except ValueError as exc:
        raise AuthError("invalid_weekdays", str(exc), 422) from exc

    unit = (
        payload.unit_price_cents
        if payload.unit_price_cents is not None
        else (service.default_price_cents or 0)
    )
    try:
        money = compose_financial(
            lesson_count=len(lesson_dates),
            unit_price_cents=unit,
            adjustment_cents=payload.adjustment_cents,
            final_cents=payload.final_cents,
        )
    except ValueError as exc:
        raise AuthError("invalid_financial", str(exc), 422) from exc

    duration_minutes = payload.lesson_duration_minutes or service.default_duration_minutes or 60

    return CyclePreviewOut(
        starts_on=payload.starts_on,
        ends_on=ends_on,
        weekdays=payload.weekdays,
        lesson_dates=lesson_dates,
        lesson_count=money.lesson_count,
        unit_price_cents=money.unit_price_cents,
        subtotal_cents=money.subtotal_cents,
        adjustment_cents=money.adjustment_cents,
        final_cents=money.final_cents,
        lesson_duration_minutes=duration_minutes,
        duration_type=duration_type,
        duration_value=duration_value,
        weekly_frequency=weekly_frequency if template else len(payload.weekdays),
    )


def _org_tz(db: Session, organization_id: uuid.UUID) -> ZoneInfo:
    from app.models.organization import Organization

    org = db.get(Organization, organization_id)
    name = org.timezone if org else "America/Sao_Paulo"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("America/Sao_Paulo")


def _local_dt(day: date, starts_time: time, tz: ZoneInfo) -> datetime:
    return datetime(
        day.year,
        day.month,
        day.day,
        starts_time.hour,
        starts_time.minute,
        starts_time.second,
        tzinfo=tz,
    )


def create_intelligent_cycle(
    db: Session,
    *,
    organization_id: uuid.UUID,
    payload: IntelligentCycleCreate,
) -> Cycle:
    if payload.idempotency_key:
        existing = db.scalar(
            select(Cycle).where(
                Cycle.organization_id == organization_id,
                Cycle.idempotency_key == payload.idempotency_key,
            )
        )
        if existing is not None:
            return domain_svc.get_cycle(
                db, organization_id=organization_id, cycle_id=existing.id
            )

    client = domain_svc.get_client(
        db, organization_id=organization_id, client_id=payload.client_id
    )
    if client.status != "active":
        raise AuthError("client_archived", "Não é possível criar ciclo para cliente arquivado.")
    service = domain_svc.get_service(
        db, organization_id=organization_id, service_id=payload.service_id
    )
    if service.status != "active":
        raise AuthError("service_archived", "Não é possível criar ciclo com serviço arquivado.")

    renewal_row: RenewalRequest | None = None
    if payload.renewal_request_id is not None:
        renewal_row = db.scalar(
            select(RenewalRequest).where(
                RenewalRequest.organization_id == organization_id,
                RenewalRequest.id == payload.renewal_request_id,
            )
        )
        if renewal_row is None:
            raise AuthError("renewal_not_found", "Solicitação de renovação não encontrada.", 404)
        if renewal_row.client_id != payload.client_id:
            raise AuthError(
                "renewal_client_mismatch",
                "A renovação não pertence a este cliente.",
                422,
            )
        if renewal_row.created_cycle_id is not None:
            return domain_svc.get_cycle(
                db, organization_id=organization_id, cycle_id=renewal_row.created_cycle_id
            )
        if renewal_row.status in {"dismissed", "canceled", "rejected"}:
            raise AuthError(
                "renewal_closed",
                "Esta solicitação de renovação não pode mais ser aprovada.",
                422,
            )

    template = get_template(
        db, organization_id=organization_id, template_id=payload.cycle_template_id
    )
    if template.status != "active":
        raise AuthError("template_archived", "Não é possível usar um modelo arquivado.")

    if len(payload.weekdays) != template.weekly_frequency:
        raise AuthError(
            "weekday_mismatch",
            f"Selecione exatamente {template.weekly_frequency} dia(s) da semana.",
            422,
        )

    location: Location | None = None
    if payload.location_id is not None:
        location = agenda_svc.get_location(
            db, organization_id=organization_id, location_id=payload.location_id
        )

    preview = build_preview(
        db,
        organization_id=organization_id,
        payload=CyclePreviewIn(
            service_id=payload.service_id,
            cycle_template_id=payload.cycle_template_id,
            starts_on=payload.starts_on,
            weekdays=payload.weekdays,
            unit_price_cents=payload.unit_price_cents,
            adjustment_cents=payload.adjustment_cents,
            final_cents=payload.final_cents,
            lesson_duration_minutes=payload.lesson_duration_minutes,
        ),
    )
    if preview.lesson_count < 1:
        raise AuthError(
            "no_lessons",
            "Nenhuma aula cai neste período com os dias escolhidos.",
            422,
        )

    planned: list[tuple[datetime, datetime]] = []
    if not payload.generate_appointments or payload.starts_time is None:
        raise AuthError(
            "agenda_required",
            "Ciclo com programação deve gerar as aulas na agenda.",
            422,
        )
    assert payload.starts_time is not None
    tz = _org_tz(db, organization_id)
    from app.services import cycle_schedule as schedule_svc

    slots = schedule_svc.slots_from_payload(
        payload.weekdays, starts_time=payload.starts_time
    )
    occurrences = schedule_svc.build_occurrences(
        starts_on=preview.starts_on,
        ends_on=preview.ends_on,
        slots=slots,
        duration_minutes=preview.lesson_duration_minutes,
        tz=tz,
    )
    planned = [(o.starts_at, o.ends_at) for o in occurrences]
    # Renewal approval will end the source cycle and cancel its future scheduled
    # appointments after create. Exclude that source from conflict detection so a
    # legitimate same-slot renewal is not blocked by appointments about to be cancelled.
    exclude_cycle_id = (
        renewal_row.source_cycle_id
        if renewal_row is not None and renewal_row.source_cycle_id is not None
        else None
    )
    hits = schedule_svc.find_occurrence_conflicts(
        db,
        organization_id=organization_id,
        occurrences=occurrences,
        exclude_cycle_id=exclude_cycle_id,
    )
    if hits:
        all_conflicts = []
        for hit in hits:
            for row in hit.conflicting:
                all_conflicts.append(
                    {
                        "id": str(row.id),
                        "client_name": row.client.full_name if row.client else None,
                        "starts_at": row.starts_at.isoformat(),
                        "ends_at": row.ends_at.isoformat(),
                        "status": row.status,
                        "occurrence": schedule_svc.format_occurrence_label(
                            hit.occurrence, tz
                        ),
                    }
                )
            if not hit.conflicting:
                all_conflicts.append(
                    {
                        "id": None,
                        "client_name": client.full_name,
                        "starts_at": hit.occurrence.starts_at.isoformat(),
                        "ends_at": hit.occurrence.ends_at.isoformat(),
                        "status": "planned_batch",
                    }
                )
        alts = schedule_svc.suggest_recurring_times(
            db,
            organization_id=organization_id,
            starts_on=preview.starts_on,
            ends_on=preview.ends_on,
            weekdays=payload.weekdays,
            duration_minutes=preview.lesson_duration_minutes,
            tz=tz,
            preferred=payload.starts_time,
        )
        raise AuthError(
            "appointment_conflict",
            "Há conflito de horário. Nenhuma aula foi criada.",
            status_code=409,
            details={"conflicts": all_conflicts, "suggestions": alts},
        )

    cycle = Cycle(
        organization_id=organization_id,
        client_id=client.id,
        service_id=service.id,
        cycle_template_id=template.id,
        cycle_type="period",
        status="active",
        starts_on=preview.starts_on,
        ends_on=preview.ends_on,
        weekdays=preview.weekdays,
        lesson_count=preview.lesson_count,
        unit_price_cents=preview.unit_price_cents,
        subtotal_cents=preview.subtotal_cents,
        adjustment_cents=preview.adjustment_cents,
        value_cents=preview.final_cents,
        lesson_duration_minutes=preview.lesson_duration_minutes,
        default_location_id=location.id if location else None,
        default_starts_time=payload.starts_time,
        duration_type=preview.duration_type,
        duration_value=preview.duration_value,
        weekly_frequency=preview.weekly_frequency,
        is_legacy=False,
        idempotency_key=payload.idempotency_key,
        notes=domain_svc._normalize_optional_str(payload.notes),
    )
    db.add(cycle)
    db.flush()

    if payload.create_receivable and preview.final_cents is not None:
        due = payload.receivable_due_on or payload.starts_on
        db.add(
            Receivable(
                organization_id=organization_id,
                cycle_id=cycle.id,
                client_id=client.id,
                amount_cents=preview.final_cents,
                due_on=due,
                status="pending",
            )
        )

    if len(planned) != int(preview.lesson_count):
        raise AuthError(
            "agenda_incomplete",
            "A agenda gerada não corresponde à quantidade de aulas do ciclo.",
            500,
        )

    title = f"{service.name} · {client.full_name}"
    for start_at, end_at in planned:
        db.add(
            Appointment(
                organization_id=organization_id,
                client_id=client.id,
                cycle_id=cycle.id,
                service_id=service.id,
                location_id=location.id if location else None,
                title=title,
                notes="Origem: ciclo",
                starts_at=start_at,
                ends_at=end_at,
                status="scheduled",
            )
        )

    if payload.renewal_request_id is not None and renewal_row is not None:
        renewal_row.status = "resolved"
        renewal_row.resolved_at = datetime.now(UTC)
        renewal_row.created_cycle_id = cycle.id
        db.add(renewal_row)
        # Source cycle leaves the operational "active nearing" surface once renewed.
        source = db.scalar(
            select(Cycle).where(
                Cycle.organization_id == organization_id,
                Cycle.id == renewal_row.source_cycle_id,
            )
        )
        if source is not None and source.status == "active":
            source.status = "ended"
            db.add(source)
            now_utc = datetime.now(UTC)
            future_open = list(
                db.scalars(
                    select(Appointment).where(
                        Appointment.organization_id == organization_id,
                        Appointment.cycle_id == source.id,
                        Appointment.status == "scheduled",
                        Appointment.starts_at > now_utc,
                    )
                ).all()
            )
            for appt in future_open:
                appt.status = "cancelled"
                db.add(appt)

    db.commit()
    return domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)


def update_intelligent_cycle(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
    payload: IntelligentCycleUpdate,
) -> Cycle:
    """Contractual/financial update. Does not modify existing appointments (ADR-024)."""
    cycle = domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    fields = payload.model_dump(exclude_unset=True)
    _reject_snapshot_mutation(fields)

    if cycle.is_legacy:
        # Legacy: notes only — structural/financial edits require a new intelligent cycle.
        allowed = set(fields.keys()) <= {"notes"}
        if not allowed:
            raise AuthError(
                "legacy_cycle",
                "Ciclo legado: edite apenas observações ou crie um novo ciclo inteligente.",
                422,
            )
        if "notes" in fields:
            cycle.notes = domain_svc._normalize_optional_str(fields["notes"])
            db.add(cycle)
            db.commit()
        return domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)

    # Shared policy: paid cycles cannot change financial outcome via any route.
    _guard_financial_outcome_mutation(cycle, fields)

    if "notes" in fields:
        cycle.notes = domain_svc._normalize_optional_str(fields["notes"])

    if "service_id" in fields and fields["service_id"] is not None:
        service = domain_svc.get_service(
            db, organization_id=organization_id, service_id=fields["service_id"]
        )
        if service.status != "active" and service.id != cycle.service_id:
            raise AuthError("service_archived", "Serviço arquivado.")
        cycle.service_id = service.id

    if "cycle_template_id" in fields and fields["cycle_template_id"] is not None:
        template = get_template(
            db, organization_id=organization_id, template_id=fields["cycle_template_id"]
        )
        cycle.cycle_template_id = template.id
        cycle.duration_type = template.duration_type
        cycle.duration_value = template.duration_value
        cycle.weekly_frequency = template.weekly_frequency

    if "default_location_id" in fields:
        loc_id = fields["default_location_id"]
        if loc_id is None:
            cycle.default_location_id = None
        else:
            agenda_svc.get_location(db, organization_id=organization_id, location_id=loc_id)
            cycle.default_location_id = loc_id

    if "default_starts_time" in fields:
        cycle.default_starts_time = fields["default_starts_time"]
    if "lesson_duration_minutes" in fields and fields["lesson_duration_minutes"] is not None:
        cycle.lesson_duration_minutes = fields["lesson_duration_minutes"]

    touching_financial = bool(FINANCIAL_INPUT_KEYS & fields.keys())
    # Pure financial edit: keep lesson snapshot, only recompose money.
    only_financial = touching_financial and not any(
        k in fields
        for k in (
            "weekdays",
            "starts_on",
            "cycle_template_id",
            "service_id",
            "lesson_duration_minutes",
            "default_location_id",
            "default_starts_time",
        )
    )
    if only_financial:
        _apply_financial_composition(
            db,
            cycle=cycle,
            adjustment_cents=fields.get("adjustment_cents"),
            final_cents=fields.get("final_cents"),
            has_final="final_cents" in fields,
            has_adjustment="adjustment_cents" in fields,
        )
        db.add(cycle)
        db.commit()
        return domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)

    structural = bool(STRUCTURAL_RECALC_KEYS & fields.keys()) or touching_financial

    if structural:
        starts_on = fields.get("starts_on", cycle.starts_on)
        weekdays = fields.get("weekdays", cycle.weekdays) or []
        template_id = fields.get("cycle_template_id", cycle.cycle_template_id)
        if template_id is None:
            raise AuthError("missing_template", "Ciclo sem modelo não pode recalcular.", 422)
        if cycle.weekly_frequency and len(weekdays) != cycle.weekly_frequency:
            tmpl = get_template(db, organization_id=organization_id, template_id=template_id)
            if len(weekdays) != tmpl.weekly_frequency:
                raise AuthError(
                    "weekday_mismatch",
                    f"Selecione exatamente {tmpl.weekly_frequency} dia(s).",
                    422,
                )

        preview = build_preview(
            db,
            organization_id=organization_id,
            payload=CyclePreviewIn(
                service_id=fields.get("service_id", cycle.service_id),
                cycle_template_id=template_id,
                starts_on=starts_on,
                weekdays=weekdays,
                unit_price_cents=cycle.unit_price_cents,
                adjustment_cents=fields.get("adjustment_cents")
                if "final_cents" not in fields
                else None,
                final_cents=fields.get("final_cents"),
                lesson_duration_minutes=fields.get(
                    "lesson_duration_minutes",
                    cycle.lesson_duration_minutes,
                ),
            ),
        )
        cycle.starts_on = preview.starts_on
        cycle.ends_on = preview.ends_on
        cycle.weekdays = preview.weekdays
        cycle.lesson_count = preview.lesson_count
        cycle.unit_price_cents = preview.unit_price_cents
        cycle.subtotal_cents = preview.subtotal_cents
        cycle.adjustment_cents = preview.adjustment_cents
        cycle.value_cents = preview.final_cents
        cycle.lesson_duration_minutes = preview.lesson_duration_minutes
        cycle.duration_type = preview.duration_type
        cycle.duration_value = preview.duration_value
        cycle.weekly_frequency = preview.weekly_frequency
        _sync_pending_receivable(db, cycle=cycle, amount_cents=preview.final_cents)

    db.add(cycle)
    db.commit()
    return domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)


def update_cycle_financial(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
    payload: FinancialCycleUpdate,
) -> Cycle:
    """Financial-only edit. Never touches appointments (ADR-024)."""
    cycle = domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    if cycle.is_legacy:
        raise AuthError(
            "legacy_cycle",
            "Ciclo legado não permite edição financeira inteligente.",
            422,
        )
    if cycle.lesson_count is None or cycle.unit_price_cents is None:
        raise AuthError(
            "incomplete_snapshot",
            "Este ciclo não possui composição financeira completa.",
            422,
        )

    fields = payload.model_dump(exclude_unset=True)
    _reject_snapshot_mutation(fields)
    _guard_financial_outcome_mutation(cycle, fields)

    if "notes" in fields:
        note = domain_svc._normalize_optional_str(fields["notes"])
        if note:
            existing = cycle.notes or ""
            appendix = f"\n[Ajuste financeiro] {note}"
            cycle.notes = (existing + appendix).strip()

    touching_financial = bool(FINANCIAL_INPUT_KEYS & fields.keys())
    if touching_financial:
        _apply_financial_composition(
            db,
            cycle=cycle,
            adjustment_cents=fields.get("adjustment_cents"),
            final_cents=fields.get("final_cents"),
            has_final="final_cents" in fields,
            has_adjustment="adjustment_cents" in fields,
        )

    db.add(cycle)
    db.commit()
    return domain_svc.get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)


def _reject_snapshot_mutation(fields: dict) -> None:
    """Snapshot / derived money fields are never client-writable."""
    if "unit_price_cents" in fields:
        raise AuthError(
            "snapshot_immutable",
            "O valor por aula congelado no ciclo não pode ser alterado.",
            422,
        )
    leaked = SNAPSHOT_IMMUTABLE_KEYS & fields.keys()
    if leaked:
        raise AuthError(
            "snapshot_immutable",
            "Campos de snapshot financeiro não podem ser alterados diretamente.",
            422,
        )


def _guard_financial_outcome_mutation(cycle: Cycle, fields: dict) -> None:
    """Block paid cycles before any path that can change money outcome."""
    if (FINANCIAL_INPUT_KEYS | STRUCTURAL_RECALC_KEYS) & fields.keys():
        _assert_financial_editable(cycle)


def _assert_financial_editable(cycle: Cycle) -> None:
    received = [
        r
        for r in (cycle.receivables or [])
        if r.status in {"received", "paid"}
    ]
    if received:
        raise AuthError(
            "payment_confirmed",
            "Este pagamento já foi confirmado. Para preservar o histórico financeiro, "
            "os valores deste ciclo não podem ser alterados por este fluxo.",
            409,
        )


def _apply_financial_composition(
    db: Session,
    *,
    cycle: Cycle,
    adjustment_cents: int | None,
    final_cents: int | None,
    has_final: bool,
    has_adjustment: bool,
) -> None:
    if cycle.lesson_count is None or cycle.unit_price_cents is None:
        raise AuthError(
            "incomplete_snapshot",
            "Este ciclo não possui composição financeira completa.",
            422,
        )
    try:
        money = compose_financial(
            lesson_count=cycle.lesson_count,
            unit_price_cents=cycle.unit_price_cents,
            adjustment_cents=adjustment_cents if has_adjustment and not has_final else None,
            final_cents=final_cents if has_final else None,
        )
    except ValueError as exc:
        raise AuthError("invalid_financial", str(exc), 422) from exc

    cycle.subtotal_cents = money.subtotal_cents
    cycle.adjustment_cents = money.adjustment_cents
    cycle.value_cents = money.final_cents
    _sync_pending_receivable(db, cycle=cycle, amount_cents=money.final_cents)


def _sync_pending_receivable(db: Session, *, cycle: Cycle, amount_cents: int) -> None:
    pending = [
        r
        for r in (cycle.receivables or [])
        if r.status in {"pending", "expected"}
    ]
    if len(pending) == 1:
        pending[0].amount_cents = amount_cents
        db.add(pending[0])
    elif len(pending) > 1:
        raise AuthError(
            "receivable_ambiguous",
            "Há mais de um recebimento aberto; ajuste manualmente.",
            409,
        )
    # Zero pending: do not auto-create (documented divergence for cycles without receivable)


def enrich_cycle_out(cycle: Cycle, base: CycleOut) -> CycleOut:
    data = base.model_dump()
    data.update(
        {
            "cycle_template_id": cycle.cycle_template_id,
            "weekdays": cycle.weekdays,
            "lesson_count": cycle.lesson_count,
            "unit_price_cents": cycle.unit_price_cents,
            "subtotal_cents": cycle.subtotal_cents,
            "adjustment_cents": cycle.adjustment_cents,
            "lesson_duration_minutes": cycle.lesson_duration_minutes,
            "default_location_id": cycle.default_location_id,
            "default_starts_time": cycle.default_starts_time.isoformat(timespec="minutes")
            if cycle.default_starts_time
            else None,
            "duration_type": cycle.duration_type,
            "duration_value": cycle.duration_value,
            "weekly_frequency": cycle.weekly_frequency,
            "is_legacy": cycle.is_legacy,
            "duration_label": (
                duration_label(cycle.duration_type, cycle.duration_value)
                if cycle.duration_type and cycle.duration_value
                else None
            ),
        }
    )
    return CycleOut.model_validate(data)
