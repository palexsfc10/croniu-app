from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime, timedelta
from urllib.parse import quote

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client
from app.models.cycle import Cycle
from app.models.receivable import Receivable
from app.models.service import Service
from app.schemas.domain import (
    CycleOut,
    HomeSummaryOut,
    PriorityActionOut,
    ReceivableOut,
    WhatsAppPrepOut,
)
from app.services.auth import AuthError

NEARING_END_DAYS = 7


def _normalize_optional_str(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_email(value: str | None) -> str | None:
    normalized = _normalize_optional_str(value)
    return normalized.lower() if normalized else None


def phone_digits(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D+", "", phone)
    return digits or None


# --- Clients -----------------------------------------------------------------


def list_clients(
    db: Session, *, organization_id: uuid.UUID, status: str | None = "active"
) -> list[Client]:
    query: Select[tuple[Client]] = select(Client).where(Client.organization_id == organization_id)
    if status:
        query = query.where(Client.status == status)
    return list(db.scalars(query.order_by(Client.full_name.asc())).all())


def get_client(db: Session, *, organization_id: uuid.UUID, client_id: uuid.UUID) -> Client:
    client = db.scalar(
        select(Client).where(Client.id == client_id, Client.organization_id == organization_id)
    )
    if client is None:
        raise AuthError("not_found", "Cliente não encontrado.", 404)
    return client


def create_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    full_name: str,
    phone: str | None,
    email: str | None,
    notes: str | None,
) -> Client:
    client = Client(
        organization_id=organization_id,
        full_name=full_name.strip(),
        phone=_normalize_optional_str(phone),
        email=_normalize_email(email),
        notes=_normalize_optional_str(notes),
        status="active",
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def update_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    **fields: object,
) -> Client:
    client = get_client(db, organization_id=organization_id, client_id=client_id)
    if "full_name" in fields and fields["full_name"] is not None:
        client.full_name = str(fields["full_name"]).strip()
    if "phone" in fields:
        client.phone = _normalize_optional_str(
            fields["phone"] if isinstance(fields["phone"], str) else None
        )
    if "email" in fields:
        email_val = fields["email"]
        client.email = _normalize_email(str(email_val) if email_val is not None else None)
    if "notes" in fields:
        notes_val = fields["notes"]
        client.notes = _normalize_optional_str(str(notes_val) if notes_val is not None else None)
    if "status" in fields and fields["status"] is not None:
        client.status = str(fields["status"])
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


# --- Services ----------------------------------------------------------------


def list_services(
    db: Session, *, organization_id: uuid.UUID, status: str | None = "active"
) -> list[Service]:
    query = select(Service).where(Service.organization_id == organization_id)
    if status:
        query = query.where(Service.status == status)
    return list(db.scalars(query.order_by(Service.name.asc())).all())


def get_service(db: Session, *, organization_id: uuid.UUID, service_id: uuid.UUID) -> Service:
    service = db.scalar(
        select(Service).where(Service.id == service_id, Service.organization_id == organization_id)
    )
    if service is None:
        raise AuthError("not_found", "Serviço não encontrado.", 404)
    return service


def create_service(
    db: Session,
    *,
    organization_id: uuid.UUID,
    name: str,
    description: str | None,
    default_duration_days: int,
    default_price_cents: int | None,
    default_duration_minutes: int = 60,
) -> Service:
    service = Service(
        organization_id=organization_id,
        name=name.strip(),
        description=_normalize_optional_str(description),
        default_duration_days=default_duration_days,
        default_duration_minutes=default_duration_minutes,
        default_price_cents=default_price_cents,
        status="active",
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


def update_service(
    db: Session,
    *,
    organization_id: uuid.UUID,
    service_id: uuid.UUID,
    **fields: object,
) -> Service:
    service = get_service(db, organization_id=organization_id, service_id=service_id)
    for key in (
        "name",
        "description",
        "default_duration_days",
        "default_duration_minutes",
        "default_price_cents",
        "status",
    ):
        if key in fields and fields[key] is not None:
            if key in {"name", "description", "status"}:
                setattr(
                    service,
                    key,
                    _normalize_optional_str(str(fields[key]))
                    if key != "status"
                    else str(fields[key]),
                )
            else:
                setattr(service, key, fields[key])
    if "description" in fields and fields["description"] is None:
        service.description = None
    if "name" in fields and fields["name"] is not None:
        service.name = str(fields["name"]).strip()
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


# --- Cycles ------------------------------------------------------------------


def _cycle_out(cycle: Cycle, today: date | None = None) -> CycleOut:
    today = today or date.today()
    days_remaining = (cycle.ends_on - today).days
    is_nearing = cycle.status == "active" and 0 <= days_remaining <= NEARING_END_DAYS
    duration_label = None
    if cycle.duration_type and cycle.duration_value:
        if cycle.duration_type == "calendar_months":
            duration_label = (
                "1 mês" if cycle.duration_value == 1 else f"{cycle.duration_value} meses"
            )
        elif cycle.duration_type == "fixed_days":
            duration_label = (
                "1 dia" if cycle.duration_value == 1 else f"{cycle.duration_value} dias"
            )
    return CycleOut(
        id=cycle.id,
        client_id=cycle.client_id,
        service_id=cycle.service_id,
        cycle_template_id=cycle.cycle_template_id,
        cycle_type=cycle.cycle_type,
        status=cycle.status,
        starts_on=cycle.starts_on,
        ends_on=cycle.ends_on,
        weekdays=list(cycle.weekdays) if cycle.weekdays is not None else None,
        lesson_count=cycle.lesson_count,
        unit_price_cents=cycle.unit_price_cents,
        subtotal_cents=cycle.subtotal_cents,
        adjustment_cents=cycle.adjustment_cents,
        value_cents=cycle.value_cents,
        lesson_duration_minutes=cycle.lesson_duration_minutes,
        default_location_id=cycle.default_location_id,
        default_starts_time=(
            cycle.default_starts_time.isoformat(timespec="minutes")
            if cycle.default_starts_time
            else None
        ),
        duration_type=cycle.duration_type,
        duration_value=cycle.duration_value,
        weekly_frequency=cycle.weekly_frequency,
        is_legacy=bool(cycle.is_legacy),
        duration_label=duration_label,
        notes=cycle.notes,
        last_contacted_at=cycle.last_contacted_at,
        contact_confirmed_at=cycle.contact_confirmed_at,
        created_at=cycle.created_at,
        updated_at=cycle.updated_at,
        client_name=cycle.client.full_name if cycle.client else None,
        service_name=cycle.service.name if cycle.service else None,
        days_remaining=days_remaining,
        is_nearing_end=is_nearing,
    )


def list_cycles(
    db: Session,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
    client_id: uuid.UUID | None = None,
) -> list[CycleOut]:
    query = (
        select(Cycle)
        .where(Cycle.organization_id == organization_id)
        .options(selectinload(Cycle.client), selectinload(Cycle.service))
    )
    if status:
        query = query.where(Cycle.status == status)
    if client_id:
        query = query.where(Cycle.client_id == client_id)
    rows = db.scalars(query.order_by(Cycle.ends_on.asc())).all()
    return [_cycle_out(row) for row in rows]


def get_cycle(db: Session, *, organization_id: uuid.UUID, cycle_id: uuid.UUID) -> Cycle:
    cycle = db.scalar(
        select(Cycle)
        .where(Cycle.id == cycle_id, Cycle.organization_id == organization_id)
        .options(
            selectinload(Cycle.client), selectinload(Cycle.service), selectinload(Cycle.receivables)
        )
    )
    if cycle is None:
        raise AuthError("not_found", "Ciclo não encontrado.", 404)
    return cycle


def create_cycle(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    service_id: uuid.UUID,
    starts_on: date,
    ends_on: date,
    value_cents: int | None,
    notes: str | None,
    create_receivable: bool,
    receivable_due_on: date | None,
) -> Cycle:
    client = get_client(db, organization_id=organization_id, client_id=client_id)
    if client.status != "active":
        raise AuthError("client_archived", "Não é possível criar ciclo para cliente arquivado.")
    service = get_service(db, organization_id=organization_id, service_id=service_id)
    if service.status != "active":
        raise AuthError("service_archived", "Não é possível criar ciclo com serviço arquivado.")
    if ends_on < starts_on:
        raise AuthError("invalid_dates", "A data de fim deve ser igual ou posterior ao início.")

    amount = value_cents if value_cents is not None else service.default_price_cents
    cycle = Cycle(
        organization_id=organization_id,
        client_id=client.id,
        service_id=service.id,
        cycle_type="period",
        status="active",
        starts_on=starts_on,
        ends_on=ends_on,
        value_cents=amount,
        notes=_normalize_optional_str(notes),
        is_legacy=True,
    )
    db.add(cycle)
    db.flush()

    if create_receivable and amount is not None and amount >= 0:
        due = receivable_due_on or starts_on
        receivable = Receivable(
            organization_id=organization_id,
            cycle_id=cycle.id,
            client_id=client.id,
            amount_cents=amount,
            due_on=due,
            status="pending",
        )
        db.add(receivable)

    db.commit()
    return get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)


def prepare_whatsapp_renewal(
    db: Session, *, organization_id: uuid.UUID, cycle_id: uuid.UUID
) -> WhatsAppPrepOut:
    cycle = get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    client = cycle.client
    service_name = cycle.service.name if cycle.service else "seu pacote"
    message = (
        f"Olá {client.full_name}! Seu ciclo de {service_name} "
        f"encerra em {cycle.ends_on.strftime('%d/%m/%Y')}. "
        "Podemos conversar sobre a renovação?"
    )
    digits = phone_digits(client.phone)
    wa_url = f"https://wa.me/{digits}?text={quote(message)}" if digits else None
    cycle.last_contacted_at = datetime.now(UTC)
    db.add(cycle)
    db.commit()
    return WhatsAppPrepOut(
        cycle_id=cycle.id,
        client_id=client.id,
        client_name=client.full_name,
        phone=client.phone,
        message=message,
        wa_url=wa_url,
        can_open_whatsapp=bool(wa_url),
    )


def confirm_cycle_contact(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
    note: str | None = None,
) -> CycleOut:
    cycle = get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    cycle.contact_confirmed_at = datetime.now(UTC)
    if note:
        existing = cycle.notes or ""
        appendix = f"\n[Contato] {note.strip()}"
        cycle.notes = (existing + appendix).strip()
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return _cycle_out(cycle)


# --- Receivables -------------------------------------------------------------


def _receivable_out(row: Receivable) -> ReceivableOut:
    return ReceivableOut(
        id=row.id,
        cycle_id=row.cycle_id,
        client_id=row.client_id,
        amount_cents=row.amount_cents,
        due_on=row.due_on,
        status=row.status,
        paid_at=row.paid_at,
        payment_method=row.payment_method,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
        client_name=row.client.full_name if row.client else None,
        cycle_service_name=row.cycle.service.name if row.cycle and row.cycle.service else None,
    )


def list_receivables(
    db: Session,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
) -> list[ReceivableOut]:
    query = (
        select(Receivable)
        .where(Receivable.organization_id == organization_id)
        .options(
            selectinload(Receivable.client),
            selectinload(Receivable.cycle).selectinload(Cycle.service),
        )
    )
    if status:
        query = query.where(Receivable.status == status)
    rows = db.scalars(query.order_by(Receivable.due_on.asc())).all()
    return [_receivable_out(row) for row in rows]


def get_receivable(
    db: Session, *, organization_id: uuid.UUID, receivable_id: uuid.UUID
) -> Receivable:
    row = db.scalar(
        select(Receivable)
        .where(Receivable.id == receivable_id, Receivable.organization_id == organization_id)
        .options(
            selectinload(Receivable.client),
            selectinload(Receivable.cycle).selectinload(Cycle.service),
        )
    )
    if row is None:
        raise AuthError("not_found", "Recebimento não encontrado.", 404)
    return row


def create_receivable(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
    amount_cents: int,
    due_on: date,
    notes: str | None,
) -> ReceivableOut:
    cycle = get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    row = Receivable(
        organization_id=organization_id,
        cycle_id=cycle.id,
        client_id=cycle.client_id,
        amount_cents=amount_cents,
        due_on=due_on,
        status="pending",
        notes=_normalize_optional_str(notes),
    )
    db.add(row)
    db.commit()
    return _receivable_out(
        get_receivable(db, organization_id=organization_id, receivable_id=row.id)
    )


def mark_receivable_paid(
    db: Session,
    *,
    organization_id: uuid.UUID,
    receivable_id: uuid.UUID,
    payment_method: str | None,
    notes: str | None,
) -> ReceivableOut:
    row = get_receivable(db, organization_id=organization_id, receivable_id=receivable_id)
    if row.status == "received":
        raise AuthError("already_paid", "Este recebimento já está marcado como pago.")
    row.status = "received"
    row.paid_at = datetime.now(UTC)
    row.payment_method = _normalize_optional_str(payment_method)
    if notes:
        row.notes = _normalize_optional_str(notes)
    db.add(row)
    db.commit()
    return _receivable_out(
        get_receivable(db, organization_id=organization_id, receivable_id=row.id)
    )


# --- Home --------------------------------------------------------------------


def build_home_summary(db: Session, *, organization_id: uuid.UUID) -> HomeSummaryOut:
    from app.services import agenda as agenda_svc

    org = agenda_svc.get_organization(db, organization_id)
    today = agenda_svc.org_local_today(org)
    tz_name = agenda_svc.get_org_timezone(org)
    horizon = today + timedelta(days=NEARING_END_DAYS)
    now = datetime.now(UTC)

    today_appts = agenda_svc.list_today_appointments(db, organization_id=organization_id)
    next_appt = agenda_svc.next_upcoming_appointment(db, organization_id=organization_id, now=now)

    nearing_rows = db.scalars(
        select(Cycle)
        .where(
            Cycle.organization_id == organization_id,
            Cycle.status == "active",
            Cycle.ends_on >= today,
            Cycle.ends_on <= horizon,
        )
        .options(selectinload(Cycle.client), selectinload(Cycle.service))
        .order_by(Cycle.ends_on.asc())
    ).all()
    nearing = [_cycle_out(row, today) for row in nearing_rows]

    renewals = [item for item in nearing if item.contact_confirmed_at is None]

    pending_rows = db.scalars(
        select(Receivable)
        .where(
            Receivable.organization_id == organization_id,
            Receivable.status.in_(["pending", "expected"]),
        )
        .options(
            selectinload(Receivable.client),
            selectinload(Receivable.cycle).selectinload(Cycle.service),
        )
        .order_by(Receivable.due_on.asc())
    ).all()
    pending = [_receivable_out(row) for row in pending_rows]
    overdue = [item for item in pending if item.due_on < today]
    due_soon = [item for item in pending if item.due_on >= today]

    # Priority (Sprint 2B): in-progress → next 2h → conflict → overdue receivable →
    # cycle ending today → cycle soon → receivable soon → renewal awaiting
    priority: PriorityActionOut | None = None

    in_progress = next(
        (
            a
            for a in today_appts
            if a.starts_at <= now < a.ends_at
        ),
        None,
    )
    soon_cutoff = now + timedelta(hours=2)
    starting_soon = next(
        (
            a
            for a in today_appts
            if now < a.starts_at <= soon_cutoff
        ),
        None,
    )

    day_agenda = agenda_svc.list_day_agenda(db, organization_id=organization_id, day=today)
    has_conflict = day_agenda.conflict_count > 0

    ending_today = [c for c in nearing if c.ends_on == today]

    def _appt_priority(kind: str, appt) -> PriorityActionOut:
        from zoneinfo import ZoneInfo

        local_start = appt.starts_at.astimezone(ZoneInfo(tz_name))
        loc = appt.location_name or "Sem local"
        label = "Em andamento" if kind == "appointment_in_progress" else "Próximo"
        title = f"{label} · {local_start.strftime('%H:%M')} · {appt.client_name}"
        return PriorityActionOut(
            kind=kind,
            title=title,
            subtitle=loc,
            href=f"/app/appointments/{appt.id}",
            entity_id=appt.id,
        )

    if in_progress is not None:
        priority = _appt_priority("appointment_in_progress", in_progress)
    elif starting_soon is not None:
        priority = _appt_priority("appointment_upcoming", starting_soon)
    elif has_conflict:
        first = day_agenda.appointments[0] if day_agenda.appointments else None
        if first:
            priority = PriorityActionOut(
                kind="agenda_conflict",
                title="Conflito na agenda de hoje",
                subtitle="Há compromissos sobrepostos. Revise os horários.",
                href="/app/agenda",
                entity_id=first.id,
            )
    elif overdue:
        first_pay = overdue[0]
        priority = PriorityActionOut(
            kind="pending_payment",
            title=f"Recebimento atrasado · {first_pay.client_name}",
            subtitle=f"Venceu em {first_pay.due_on.isoformat()}",
            href=f"/app/receivables/{first_pay.id}",
            entity_id=first_pay.id,
        )
    elif ending_today:
        first = ending_today[0]
        priority = PriorityActionOut(
            kind="cycle_nearing_end",
            title=f"Ciclo encerra hoje · {first.client_name}",
            subtitle=first.service_name or "Ciclo",
            href=f"/app/cycles/{first.id}",
            entity_id=first.id,
        )
    elif next_appt is not None and starting_soon is None and in_progress is None:
        out = agenda_svc.appointment_to_out(next_appt)
        priority = _appt_priority("appointment_upcoming", out)
    elif nearing:
        first = nearing[0]
        priority = PriorityActionOut(
            kind="cycle_nearing_end",
            title=f"Conversar com {first.client_name}",
            subtitle=f"Ciclo encerra em {first.ends_on.isoformat()} ({first.days_remaining}d)",
            href=f"/app/cycles/{first.id}",
            entity_id=first.id,
        )

    # Sprint 2D: renewal requests & payment reports after cycle-ending signals
    from app.services import my_cycle as my_cycle_svc

    renewal_reqs = my_cycle_svc.list_renewal_requests(db, organization_id=organization_id)
    pay_reports = my_cycle_svc.list_payment_reports(
        db, organization_id=organization_id, status="pending_review"
    )

    if priority is None and renewal_reqs:
        first_rr = renewal_reqs[0]
        priority = PriorityActionOut(
            kind="renewal_requested",
            title=f"Renovação solicitada · {first_rr.client_name}",
            subtitle="Cliente pediu renovação no Meu Ciclo",
            href="/app/renewals",
            entity_id=first_rr.id,
        )
    if priority is None and pay_reports:
        first_pr = pay_reports[0]
        priority = PriorityActionOut(
            kind="payment_report_pending",
            title=f"Pagamento informado · {first_pr.client_name}",
            subtitle="Aguardando sua confirmação",
            href="/app/payment-reports",
            entity_id=first_pr.id,
        )

    if priority is None and due_soon:
        first_pay = due_soon[0]
        priority = PriorityActionOut(
            kind="pending_payment",
            title=f"Recebimento de {first_pay.client_name}",
            subtitle=f"Vence em {first_pay.due_on.isoformat()}",
            href=f"/app/receivables/{first_pay.id}",
            entity_id=first_pay.id,
        )
    elif priority is None and renewals:
        first = renewals[0]
        priority = PriorityActionOut(
            kind="renewal_awaiting",
            title=f"Renovação · {first.client_name}",
            subtitle="Aguardando contato",
            href=f"/app/cycles/{first.id}",
            entity_id=first.id,
        )

    parts: list[str] = []
    if today_appts:
        parts.append(f"{len(today_appts)} compromisso(s) hoje")
    if nearing:
        parts.append(f"{len(nearing)} ciclo(s) encerrando")
    if pending:
        parts.append(f"{len(pending)} recebimento(s) pendente(s)")
    if renewal_reqs:
        parts.append(f"{len(renewal_reqs)} renovação(ões) solicitada(s)")
    if pay_reports:
        parts.append(f"{len(pay_reports)} pagamento(s) a confirmar")

    if priority is None and not parts:
        message = "Nenhuma ação pendente. Cadastre clientes e compromissos para começar."
        hint = None
    else:
        message = "Priorize o que precisa da sua atenção agora."
        hint = " · ".join(parts) if parts else None

    return HomeSummaryOut(
        organization_id=organization_id,
        timezone=tz_name,
        local_today=today,
        today_appointments=today_appts,
        cycles_nearing_end=nearing,
        renewals=renewals,
        pending_payments=pending,
        renewal_requests=[r.model_dump(mode="json") for r in renewal_reqs],
        payment_reports_pending=[r.model_dump(mode="json") for r in pay_reports],
        priority_action=priority,
        contextual_hint=hint,
        message=message,
    )


def cycle_to_out(cycle: Cycle, today: date | None = None) -> CycleOut:
    return _cycle_out(cycle, today)


def receivable_to_out(row: Receivable) -> ReceivableOut:
    return _receivable_out(row)


def count_active_clients(db: Session, *, organization_id: uuid.UUID | None = None) -> int:
    query = select(func.count()).select_from(Client).where(Client.status == "active")
    if organization_id is not None:
        query = query.where(Client.organization_id == organization_id)
    return db.scalar(query) or 0


def count_cycles(db: Session, *, organization_id: uuid.UUID | None = None) -> int:
    query = select(func.count()).select_from(Cycle)
    if organization_id is not None:
        query = query.where(Cycle.organization_id == organization_id)
    return db.scalar(query) or 0
