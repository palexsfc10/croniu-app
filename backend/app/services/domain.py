from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime
from urllib.parse import quote

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.appointment import Appointment
from app.models.client import Client
from app.models.cycle import Cycle
from app.models.cycle_template import CycleTemplate
from app.models.receivable import Receivable
from app.models.service import Service
from app.schemas.domain import (
    AttentionItemOut,
    CycleOut,
    HomeSummaryOut,
    PriorityActionOut,
    ReceivableOut,
    WhatsAppPrepOut,
)
from app.services import cycle_guard as cycle_guard_svc
from app.services import cycle_period as cycle_period_svc
from app.services.auth import AuthError

NEARING_END_DAYS = 30
PORTAL_NEARING_DAYS = 7
# Ciclo também entra em “encerrando” quando resta no máximo esta quantidade de aulas.
LESSONS_NEARING_REMAINING = 1
# Janela específica da prioridade "Ciclo chegando ao fim" na tela Hoje — mais
# estreita que NEARING_END_DAYS (usado pela listagem geral de Ciclos e pelo
# badge "Termina em breve", que continuam com o aviso antecipado de 30 dias).
HOME_CYCLE_ENDING_WINDOW_DAYS = 7


def cycle_nearing_reason(cycle: CycleOut) -> str | None:
    """Why a cycle is flagged for home attention. None if not nearing."""
    if not cycle.is_nearing_end:
        return None
    if cycle.lessons_remaining is not None and cycle.lessons_remaining == 0:
        return "lessons_exhausted"
    if (
        cycle.lessons_remaining is not None
        and 0 < cycle.lessons_remaining <= LESSONS_NEARING_REMAINING
    ):
        return "lessons_low"
    if cycle.days_remaining is not None and 0 <= cycle.days_remaining <= NEARING_END_DAYS:
        return "date"
    return "nearing"


def _cycle_nearing_copy(cycle: CycleOut) -> tuple[str, str]:
    """Title + subtitle for priority/attention when the cycle still needs renewal action."""
    name = cycle.client_name or "Cliente"
    reason = cycle_nearing_reason(cycle)
    if reason == "lessons_exhausted":
        return (
            "Aulas do ciclo esgotadas",
            f"O ciclo de {name} não tem mais aulas e ainda não possui renovação encaminhada.",
        )
    if reason == "lessons_low":
        return (
            "Última aula do ciclo",
            f"O ciclo de {name} está na última aula e ainda não possui renovação encaminhada.",
        )
    days = cycle.days_remaining
    if days is not None and days >= 0:
        when = (
            "hoje"
            if days <= 1
            else ("em 7 dias" if days <= 7 else f"em {days} dias")
        )
        return (
            "Ciclo chegando ao fim",
            f"O ciclo de {name} termina {when} e ainda não possui renovação encaminhada.",
        )
    return (
        "Ciclo chegando ao fim",
        f"O ciclo de {name} está encerrando e ainda não possui renovação encaminhada.",
    )


def _attention_cycle_subtitle(cycle: CycleOut) -> str:
    reason = cycle_nearing_reason(cycle)
    if reason == "lessons_exhausted":
        return "Aulas esgotadas · sem renovação encaminhada"
    if reason == "lessons_low":
        return "1 aula restante · sem renovação encaminhada"
    if cycle.days_remaining is not None:
        when = (
            "hoje"
            if cycle.days_remaining <= 1
            else (
                f"em {cycle.days_remaining} dias"
            )
        )
        return f"Ciclo termina {when} · sem renovação encaminhada"
    last_day = cycle_period_svc.last_inclusive_on(cycle.ends_on).strftime("%d/%m/%Y")
    renewal_day = cycle.ends_on.strftime("%d/%m/%Y")
    return f"Ciclo encerra em {last_day} · renovação em {renewal_day} · sem renovação encaminhada"


def cycles_suppressed_from_home_attention(
    *,
    nearing: list[CycleOut],
    active_cycles: list[Cycle],
    open_renewal_source_ids: set[uuid.UUID],
    completed_renewal_source_ids: set[uuid.UUID],
) -> set[uuid.UUID]:
    """Cycles that must not appear as generic 'cycle ending' on Hoje.

    Product rules (no nagging after renewal is already in motion or done):
    1. Open portal renewal for that cycle (requested / acknowledged / payment_reported)
    2. Renewal already resolved with a created successor cycle
    3. Professional already registered renewal contact (contact_confirmed_at)
    4. Same client + same service already has a newer active cycle (manual renewal)
    """
    suppressed = set(open_renewal_source_ids) | set(completed_renewal_source_ids)

    for cycle in nearing:
        if cycle.contact_confirmed_at is not None:
            suppressed.add(cycle.id)

    # Newer active successor for same client+service suppresses the older nearing cycle.
    by_client_service: dict[tuple[uuid.UUID, uuid.UUID], list[Cycle]] = {}
    for row in active_cycles:
        if row.service_id is None:
            continue
        key = (row.client_id, row.service_id)
        by_client_service.setdefault(key, []).append(row)

    for group in by_client_service.values():
        if len(group) < 2:
            continue
        ordered = sorted(
            group,
            key=lambda c: (c.starts_on, c.created_at or datetime.min.replace(tzinfo=UTC)),
        )
        newest = ordered[-1]
        for older in ordered[:-1]:
            if older.id != newest.id:
                suppressed.add(older.id)

    return suppressed


def home_cycle_ending_eligible(cycle: CycleOut, today: date) -> bool:
    """Whether a cycle already flagged `is_nearing_end` also qualifies for the
    Hoje "Ciclo chegando ao fim" priority/attention card.

    Isolated from the generic `is_nearing_end` flag on purpose: the Cycles
    list/detail pages and the "Termina em breve" badge keep the wider
    heads-up window (`NEARING_END_DAYS` = 30). Hoje is meant to surface only
    what is *actionable this week*, so the date-based reason is re-gated
    here to the cycle's last 7 calendar days of vigency — counting the
    cycle's last inclusive day (the civil day it actually ends on) as day 0.
    `ends_on` is the exclusive boundary ([starts_on, ends_on)), so a raw
    `ends_on - today` diff is always >= 1 while the cycle is still current;
    `cycle_period.last_inclusive_on` corrects for that so "termina hoje" is
    a real, distinct 0-day case rather than unreachable.

    Lesson-count-based nearing (low/exhausted lessons) is untouched — this
    hotfix only narrows the date-based window.
    """
    if not cycle.is_nearing_end:
        return False
    reason = cycle_nearing_reason(cycle)
    if reason in ("lessons_exhausted", "lessons_low"):
        return True
    days_to_last_day = (cycle_period_svc.last_inclusive_on(cycle.ends_on) - today).days
    return 0 <= days_to_last_day <= HOME_CYCLE_ENDING_WINDOW_DAYS


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
    normalized_email = _normalize_email(email)
    if normalized_email:
        existing = db.scalar(
            select(Client).where(
                Client.organization_id == organization_id,
                Client.email == normalized_email,
            )
        )
        if existing is not None:
            raise AuthError(
                "client_email_exists",
                "Já existe um cliente com este e-mail nesta organização.",
                409,
            )
    client = Client(
        organization_id=organization_id,
        full_name=full_name.strip(),
        phone=_normalize_optional_str(phone),
        email=normalized_email,
        notes=_normalize_optional_str(notes),
        status="active",
    )
    db.add(client)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        msg = str(getattr(exc, "orig", exc)).lower()
        if "email" in msg:
            raise AuthError(
                "client_email_exists",
                "Já existe um cliente com este e-mail nesta organização.",
                409,
            ) from exc
        raise AuthError("conflict", "Não foi possível criar o cliente.", 409) from exc
    db.refresh(client)
    return client


def find_client_by_email(
    db: Session, *, organization_id: uuid.UUID, email: str
) -> Client | None:
    normalized = _normalize_email(email)
    if not normalized:
        return None
    return db.scalar(
        select(Client).where(
            Client.organization_id == organization_id,
            Client.email == normalized,
        )
    )


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

LESSON_CONSUMED_STATUSES = frozenset({"completed", "no_show"})


def count_lessons_completed(
    db: Session, *, organization_id: uuid.UUID, cycle_id: uuid.UUID
) -> int:
    """Aulas encerradas no ciclo: realizado ou falta (consomem 1 do saldo)."""
    return (
        db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.organization_id == organization_id,
                Appointment.cycle_id == cycle_id,
                Appointment.status.in_(tuple(LESSON_CONSUMED_STATUSES)),
            )
        )
        or 0
    )


def count_lessons_no_show(
    db: Session, *, organization_id: uuid.UUID, cycle_id: uuid.UUID
) -> int:
    """Faltas registradas no ciclo (consomem saldo, mas devem ser avisadas)."""
    return (
        db.scalar(
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.organization_id == organization_id,
                Appointment.cycle_id == cycle_id,
                Appointment.status == "no_show",
            )
        )
        or 0
    )


def map_lesson_progress(
    db: Session, *, organization_id: uuid.UUID, cycle_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    """Map cycle_id → (lessons_consumed, lessons_no_show)."""
    if not cycle_ids:
        return {}
    rows = db.execute(
        select(Appointment.cycle_id, Appointment.status, func.count())
        .where(
            Appointment.organization_id == organization_id,
            Appointment.cycle_id.in_(cycle_ids),
            Appointment.status.in_(tuple(LESSON_CONSUMED_STATUSES)),
        )
        .group_by(Appointment.cycle_id, Appointment.status)
    ).all()
    progress: dict[uuid.UUID, list[int]] = {}
    for cycle_id, status, count in rows:
        if cycle_id is None:
            continue
        bucket = progress.setdefault(cycle_id, [0, 0])
        bucket[0] += int(count)
        if status == "no_show":
            bucket[1] += int(count)
    return {cid: (vals[0], vals[1]) for cid, vals in progress.items()}


def map_lessons_completed(
    db: Session, *, organization_id: uuid.UUID, cycle_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    return {
        cid: consumed
        for cid, (consumed, _no_show) in map_lesson_progress(
            db, organization_id=organization_id, cycle_ids=cycle_ids
        ).items()
    }


def _cycle_out(
    cycle: Cycle,
    today: date | None = None,
    *,
    lessons_completed: int = 0,
    lessons_no_show: int = 0,
) -> CycleOut:
    today = today or date.today()
    days_remaining = (cycle.ends_on - today).days
    current = cycle_period_svc.is_current(
        starts_on=cycle.starts_on, ends_on=cycle.ends_on, today=today
    )
    lessons_remaining = None
    if cycle.lesson_count is not None:
        lessons_remaining = max(0, int(cycle.lesson_count) - int(lessons_completed))
    nearing_by_date = (
        cycle.status == "active"
        and current
        and 1 <= days_remaining <= NEARING_END_DAYS
    )
    nearing_by_lessons = (
        cycle.status == "active"
        and lessons_remaining is not None
        and 0 < lessons_remaining <= LESSONS_NEARING_REMAINING
    )
    # 0 remaining: ciclo de aulas esgotado — ainda sinaliza para ação (renovar/fechar)
    nearing_by_lessons_exhausted = (
        cycle.status == "active" and lessons_remaining is not None and lessons_remaining == 0
    )
    is_nearing = nearing_by_date or nearing_by_lessons or nearing_by_lessons_exhausted
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
        lessons_completed=int(lessons_completed),
        lessons_no_show=int(lessons_no_show),
        lessons_remaining=lessons_remaining,
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


def _org_today(db: Session, organization_id: uuid.UUID) -> date:
    from app.services import agenda as agenda_svc

    org = agenda_svc.get_organization(db, organization_id)
    return agenda_svc.org_local_today(org)


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
    rows = list(db.scalars(query.order_by(Cycle.ends_on.asc())).all())
    today = _org_today(db, organization_id)
    progress = map_lesson_progress(
        db, organization_id=organization_id, cycle_ids=[row.id for row in rows]
    )
    return [
        _cycle_out(
            row,
            today,
            lessons_completed=progress.get(row.id, (0, 0))[0],
            lessons_no_show=progress.get(row.id, (0, 0))[1],
        )
        for row in rows
    ]


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
    weekly_frequency: int | None = None,
    lesson_count: int | None = None,
    duration_type: str | None = None,
    duration_value: int | None = None,
    cycle_template_id: uuid.UUID | None = None,
    adjustment_cents: int | None = None,
    lesson_duration_minutes: int | None = None,
) -> Cycle:
    client = get_client(db, organization_id=organization_id, client_id=client_id)
    if client.status != "active":
        raise AuthError("client_archived", "Não é possível criar ciclo para cliente arquivado.")
    service = get_service(db, organization_id=organization_id, service_id=service_id)
    if service.status != "active":
        raise AuthError("service_archived", "Não é possível criar ciclo com serviço arquivado.")
    if ends_on < starts_on:
        raise AuthError("invalid_dates", "A data de fim deve ser igual ou posterior ao início.")

    cycle_guard_svc.assert_no_duplicate_or_overlap(
        db,
        organization_id=organization_id,
        client_id=client.id,
        service_id=service.id,
        starts_on=starts_on,
        ends_on=ends_on,
        lesson_count=lesson_count,
    )

    if cycle_template_id is not None:
        tmpl = db.scalar(
            select(CycleTemplate).where(
                CycleTemplate.id == cycle_template_id,
                CycleTemplate.organization_id == organization_id,
            )
        )
        if tmpl is None:
            raise AuthError("not_found", "Modelo de ciclo não encontrado.", 404)

    amount = value_cents if value_cents is not None else service.default_price_cents
    structured = weekly_frequency is not None or duration_type is not None
    cycle = Cycle(
        organization_id=organization_id,
        client_id=client.id,
        service_id=service.id,
        cycle_template_id=cycle_template_id,
        cycle_type="period",
        status="active",
        starts_on=starts_on,
        ends_on=ends_on,
        value_cents=amount,
        adjustment_cents=adjustment_cents if adjustment_cents is not None else 0,
        notes=_normalize_optional_str(notes),
        weekly_frequency=weekly_frequency,
        lesson_count=lesson_count,
        duration_type=duration_type,
        duration_value=duration_value,
        lesson_duration_minutes=lesson_duration_minutes or service.default_duration_minutes,
        is_legacy=not structured,
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
        f"encerra em {cycle_period_svc.last_inclusive_on(cycle.ends_on).strftime('%d/%m/%Y')} "
        f"(renovação em {cycle.ends_on.strftime('%d/%m/%Y')}). "
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
    return cycle_to_out(db, cycle)


def cancel_cycle(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
) -> Cycle:
    """Soft-delete: marks the cycle cancelled; cancels open agenda/receivables."""
    cycle = get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    if cycle.status == "cancelled":
        return cycle
    if cycle.status not in {"active", "ended"}:
        raise AuthError(
            "invalid_status",
            "Só é possível excluir ciclos ativos ou encerrados.",
            422,
        )

    cycle.status = "cancelled"

    appointments = db.scalars(
        select(Appointment).where(
            Appointment.organization_id == organization_id,
            Appointment.cycle_id == cycle.id,
            Appointment.status == "scheduled",
        )
    ).all()
    for appointment in appointments:
        appointment.status = "cancelled"
        db.add(appointment)

    for receivable in cycle.receivables:
        if receivable.status in {"pending", "expected"}:
            receivable.status = "cancelled"
            db.add(receivable)

    db.add(cycle)
    db.commit()
    return get_cycle(db, organization_id=organization_id, cycle_id=cycle.id)


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


def list_receivables_for_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    limit: int = 20,
) -> list[ReceivableOut]:
    rows = db.scalars(
        select(Receivable)
        .where(
            Receivable.organization_id == organization_id,
            Receivable.client_id == client_id,
        )
        .options(
            selectinload(Receivable.client),
            selectinload(Receivable.cycle).selectinload(Cycle.service),
        )
        .order_by(Receivable.due_on.desc())
        .limit(limit)
    ).all()
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


def classify_today_appointments(
    today_appts: list,
    *,
    now: datetime,
) -> tuple[list, list, list]:
    """Split today's scheduled appointments into future / in_progress / needs_outcome.

    See docs/HOME_PRIORITY.md. Past ended slots stay in history; only leave the home
    timeline when ends_at <= now.
    """
    upcoming = [a for a in today_appts if a.starts_at > now]
    in_progress = [a for a in today_appts if a.starts_at <= now < a.ends_at]
    needing_outcome = [a for a in today_appts if a.ends_at <= now]
    return upcoming, in_progress, needing_outcome


def select_home_priority(
    *,
    overdue: list[ReceivableOut],
    due_today: list[ReceivableOut],
    due_later: list[ReceivableOut],
    pay_reports: list,
    ended_unrenewed: list[CycleOut],
    renewal_reqs: list,
    nearing: list[CycleOut],
    has_conflict: bool,
    conflict_entity_id: uuid.UUID | None,
    appointments_needing_outcome: list,
) -> PriorityActionOut | None:
    """Canonical priority selection — docs/HOME_PRIORITY.md. No appointments as priority."""

    if overdue:
        first = overdue[0]
        return PriorityActionOut(
            kind="pending_payment",
            title="Recebimento atrasado",
            subtitle=f"{first.client_name} · venceu em {first.due_on.strftime('%d/%m/%Y')}",
            href=f"/app/receivables/{first.id}",
            entity_id=first.id,
            cta_label="Revisar recebimento",
        )
    if pay_reports:
        first_pr = pay_reports[0]
        return PriorityActionOut(
            kind="payment_report_pending",
            title="Pagamento aguardando conferência",
            subtitle=f"{first_pr.client_name} informou um pagamento.",
            href="/app/payment-reports",
            entity_id=first_pr.id,
            cta_label="Revisar pagamento",
        )
    if due_today:
        first = due_today[0]
        return PriorityActionOut(
            kind="pending_payment",
            title="Recebimento vence hoje",
            subtitle=f"{first.client_name} · vence em {first.due_on.strftime('%d/%m/%Y')}",
            href=f"/app/receivables/{first.id}",
            entity_id=first.id,
            cta_label="Revisar recebimento",
        )
    if ended_unrenewed:
        first = ended_unrenewed[0]
        return PriorityActionOut(
            kind="cycle_ended_unrenewed",
            title="Ciclo encerrado sem renovação",
            subtitle=f"{first.client_name} · encerrou em {first.ends_on.strftime('%d/%m/%Y')}",
            href=f"/app/cycles/{first.id}",
            entity_id=first.id,
            cta_label="Ver ciclo",
        )
    if renewal_reqs:
        first_rr = renewal_reqs[0]
        return PriorityActionOut(
            kind="renewal_requested",
            title="Cliente quer continuar",
            subtitle=f"{first_rr.client_name} enviou uma solicitação de renovação.",
            href="/app/renewals",
            entity_id=first_rr.id,
            cta_label="Revisar solicitação",
        )
    if nearing:
        first = nearing[0]
        title, subtitle = _cycle_nearing_copy(first)
        return PriorityActionOut(
            kind="cycle_nearing_end",
            title=title,
            subtitle=subtitle,
            href=f"/app/cycles/{first.id}",
            entity_id=first.id,
            cta_label="Ver ciclo",
        )
    if has_conflict and conflict_entity_id is not None:
        return PriorityActionOut(
            kind="agenda_conflict",
            title="Conflito na agenda de hoje",
            subtitle="Há compromissos sobrepostos. Revise os horários.",
            href="/app/agenda",
            entity_id=conflict_entity_id,
            cta_label="Abrir agenda",
        )
    if appointments_needing_outcome:
        appt = appointments_needing_outcome[0]
        return PriorityActionOut(
            kind="appointment_needs_outcome",
            title="Atualizar compromisso",
            subtitle=f"{appt.client_name} · horário já passou",
            href=f"/app/appointments/{appt.id}",
            entity_id=appt.id,
            cta_label="Atualizar",
        )
    if due_later:
        first = due_later[0]
        return PriorityActionOut(
            kind="pending_payment",
            title="Recebimento próximo",
            subtitle=f"{first.client_name} · vence em {first.due_on.strftime('%d/%m/%Y')}",
            href=f"/app/receivables/{first.id}",
            entity_id=first.id,
            cta_label="Revisar recebimento",
        )
    return None


def dedupe_attention_against_priority(
    attention: list[AttentionItemOut],
    priority: PriorityActionOut | None,
) -> list[AttentionItemOut]:
    if priority is None:
        return attention
    return [item for item in attention if item.entity_id != priority.entity_id]


def build_home_summary(db: Session, *, organization_id: uuid.UUID) -> HomeSummaryOut:
    """Daily focus summary for Hoje. Rule: docs/HOME_PRIORITY.md."""
    from zoneinfo import ZoneInfo

    from app.services import agenda as agenda_svc
    from app.services import my_cycle as my_cycle_svc

    org = agenda_svc.get_organization(db, organization_id)
    today = agenda_svc.org_local_today(org)
    tz_name = agenda_svc.get_org_timezone(org)
    tz = ZoneInfo(tz_name)
    now = datetime.now(UTC)

    today_appts = agenda_svc.list_today_appointments(db, organization_id=organization_id)
    upcoming_appointments, in_progress_appointments, appointments_needing_outcome = (
        classify_today_appointments(today_appts, now=now)
    )

    active_rows = list(
        db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == organization_id,
                Cycle.status == "active",
            )
            .options(selectinload(Cycle.client), selectinload(Cycle.service))
            .order_by(Cycle.ends_on.asc())
        ).all()
    )
    ended_rows = list(
        db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == organization_id,
                Cycle.status == "ended",
            )
            .options(selectinload(Cycle.client), selectinload(Cycle.service))
            .order_by(Cycle.ends_on.desc())
            .limit(50)
        ).all()
    )
    # Active rows past ends_on also count as ended-without-renewal candidates.
    past_due_active = [
        row for row in active_rows if cycle_period_svc.is_elapsed(ends_on=row.ends_on, today=today)
    ]
    ended_candidates = ended_rows + past_due_active

    progress = map_lesson_progress(
        db,
        organization_id=organization_id,
        cycle_ids=[row.id for row in active_rows] + [row.id for row in ended_rows],
    )
    nearing_all: list[CycleOut] = []
    for row in active_rows:
        out = _cycle_out(
            row,
            today,
            lessons_completed=progress.get(row.id, (0, 0))[0],
            lessons_no_show=progress.get(row.id, (0, 0))[1],
        )
        if home_cycle_ending_eligible(out, today):
            nearing_all.append(out)
    nearing_all.sort(
        key=lambda c: (
            c.lessons_remaining if c.lessons_remaining is not None else 10_000,
            c.ends_on,
        )
    )

    ended_all: list[CycleOut] = []
    for row in ended_candidates:
        out = _cycle_out(
            row,
            today,
            lessons_completed=progress.get(row.id, (0, 0))[0],
            lessons_no_show=progress.get(row.id, (0, 0))[1],
        )
        ended_all.append(out)
    # Prefer most recently ended first.
    ended_all.sort(key=lambda c: c.ends_on, reverse=True)

    renewal_reqs = my_cycle_svc.list_renewal_requests(db, organization_id=organization_id)
    pay_reports = my_cycle_svc.list_payment_reports(
        db, organization_id=organization_id, status="pending_review"
    )
    open_renewal_source_ids = {r.source_cycle_id for r in renewal_reqs}

    from app.models.renewal_request import RenewalRequest

    completed_renewal_source_ids = set(
        db.scalars(
            select(RenewalRequest.source_cycle_id).where(
                RenewalRequest.organization_id == organization_id,
                RenewalRequest.status == "resolved",
                RenewalRequest.created_cycle_id.is_not(None),
            )
        ).all()
    )

    all_for_successor = active_rows  # successor check uses active cycles
    suppressed_nearing = cycles_suppressed_from_home_attention(
        nearing=nearing_all,
        active_cycles=all_for_successor,
        open_renewal_source_ids=open_renewal_source_ids,
        completed_renewal_source_ids=completed_renewal_source_ids,
    )
    nearing = [c for c in nearing_all if c.id not in suppressed_nearing]
    renewals = [item for item in nearing if item.contact_confirmed_at is None]

    suppressed_ended = cycles_suppressed_from_home_attention(
        nearing=ended_all,
        active_cycles=all_for_successor,
        open_renewal_source_ids=open_renewal_source_ids,
        completed_renewal_source_ids=completed_renewal_source_ids,
    )
    ended_unrenewed = [c for c in ended_all if c.id not in suppressed_ended]

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
    due_today = [item for item in pending if item.due_on == today]
    due_later = [item for item in pending if item.due_on > today]

    day_agenda = agenda_svc.list_day_agenda(db, organization_id=organization_id, day=today)
    has_conflict = day_agenda.conflict_count > 0
    conflict_entity_id = (
        day_agenda.appointments[0].id if day_agenda.appointments else None
    )

    def _local_time(appt) -> str:
        return appt.starts_at.astimezone(tz).strftime("%H:%M")

    priority = select_home_priority(
        overdue=overdue,
        due_today=due_today,
        due_later=due_later,
        pay_reports=pay_reports,
        ended_unrenewed=ended_unrenewed,
        renewal_reqs=renewal_reqs,
        nearing=nearing,
        has_conflict=has_conflict,
        conflict_entity_id=conflict_entity_id,
        appointments_needing_outcome=appointments_needing_outcome,
    )

    attention: list[AttentionItemOut] = []
    for rr in renewal_reqs:
        attention.append(
            AttentionItemOut(
                kind="renewal_requested",
                title=rr.client_name or "Cliente",
                subtitle="Renovação solicitada",
                href="/app/renewals",
                entity_id=rr.id,
                client_name=rr.client_name,
                tone="warning",
            )
        )
    for pr in pay_reports:
        attention.append(
            AttentionItemOut(
                kind="payment_report_pending",
                title=pr.client_name or "Cliente",
                subtitle="Pagamento aguardando conferência",
                href="/app/payment-reports",
                entity_id=pr.id,
                client_name=pr.client_name,
                tone="warning",
            )
        )
    for pay in pending:
        label = (
            f"Recebimento atrasado · venceu {pay.due_on.strftime('%d/%m/%Y')}"
            if pay.due_on < today
            else f"Recebimento pendente · vence {pay.due_on.strftime('%d/%m/%Y')}"
        )
        attention.append(
            AttentionItemOut(
                kind="pending_payment",
                title=pay.client_name or "Cliente",
                subtitle=label,
                href=f"/app/receivables/{pay.id}",
                entity_id=pay.id,
                client_name=pay.client_name,
                tone="warning",
            )
        )
    for cycle in ended_unrenewed:
        attention.append(
            AttentionItemOut(
                kind="cycle_ended_unrenewed",
                title=cycle.client_name or "Cliente",
                subtitle=f"Ciclo encerrado em {cycle.ends_on.strftime('%d/%m/%Y')} · sem renovação",
                href=f"/app/cycles/{cycle.id}",
                entity_id=cycle.id,
                client_name=cycle.client_name,
                tone="warning",
            )
        )
    for cycle in nearing:
        attention.append(
            AttentionItemOut(
                kind="cycle_nearing_end",
                title=cycle.client_name or "Cliente",
                subtitle=_attention_cycle_subtitle(cycle),
                href=f"/app/cycles/{cycle.id}",
                entity_id=cycle.id,
                client_name=cycle.client_name,
                tone="warning",
            )
        )
    for appt in appointments_needing_outcome:
        attention.append(
            AttentionItemOut(
                kind="appointment_needs_outcome",
                title=appt.client_name or "Cliente",
                subtitle=f"Compromisso de hoje às {_local_time(appt)} · aguardando atualização",
                href=f"/app/appointments/{appt.id}",
                entity_id=appt.id,
                client_name=appt.client_name,
                tone="neutral",
            )
        )

    attention = dedupe_attention_against_priority(attention, priority)

    has_attention = bool(attention) or priority is not None
    if not has_attention:
        message = "Você não possui nenhuma pendência importante neste momento."
    else:
        message = "Veja o que precisa da sua atenção hoje."

    from app.services import intake as intake_svc
    from app.services import pendencies as pendency_svc

    intake_counts = intake_svc.intake_home_counts(
        db, organization_id=organization_id, today=today
    )
    try:
        board = pendency_svc.board(db, organization_id=organization_id, today=today, bucket="today")
        by_type = {g["occurrence_type"]: g["count"] for g in board.get("groups", [])}
        intake_counts["protocol_reviews_due_count"] = by_type.get("plan_review", 0)
        intake_counts["routines_due_today_count"] = sum(by_type.values())
        intake_counts["feedbacks_due_count"] = by_type.get("feedback_due", 0)
        intake_counts["plans_ending_count"] = by_type.get("plan_ending", 0)
    except AuthError:
        intake_counts.setdefault("feedbacks_due_count", 0)
        intake_counts.setdefault("plans_ending_count", 0)
    if intake_counts.get("new_submissions_count"):
        n = int(intake_counts["new_submissions_count"])
        attention.insert(
            0,
            AttentionItemOut(
                kind="intake_new_submissions",
                title="Novos cadastros",
                subtitle=(
                    "1 cadastro aguardando análise"
                    if n == 1
                    else f"{n} cadastros aguardando análise"
                ),
                href="/app/clients/intake",
                entity_id=organization_id,
                tone="warning",
            ),
        )
        message = "Veja o que precisa da sua atenção hoje."

    has_active_service = bool(
        db.scalar(
            select(func.count())
            .select_from(Service)
            .where(Service.organization_id == organization_id, Service.status == "active")
        )
    )
    has_active_cycle_template = bool(
        db.scalar(
            select(func.count())
            .select_from(CycleTemplate)
            .where(
                CycleTemplate.organization_id == organization_id,
                CycleTemplate.status == "active",
            )
        )
    )
    if not has_active_service or not has_active_cycle_template:
        message = "Sua rotina ainda está sendo configurada."

    return HomeSummaryOut(
        organization_id=organization_id,
        timezone=tz_name,
        local_today=today,
        today_appointments=today_appts,
        upcoming_appointments=upcoming_appointments,
        in_progress_appointments=in_progress_appointments,
        appointments_needing_outcome=appointments_needing_outcome,
        cycles_nearing_end=nearing,
        cycles_ended_unrenewed=ended_unrenewed,
        renewals=renewals,
        pending_payments=pending,
        renewal_requests=[r.model_dump(mode="json") for r in renewal_reqs],
        payment_reports_pending=[r.model_dump(mode="json") for r in pay_reports],
        attention_items=attention,
        priority_action=priority,
        contextual_hint=None,
        message=message,
        has_active_service=has_active_service,
        has_active_cycle_template=has_active_cycle_template,
        **intake_counts,
    )


def cycle_to_out(db: Session, cycle: Cycle, today: date | None = None) -> CycleOut:
    completed = count_lessons_completed(
        db, organization_id=cycle.organization_id, cycle_id=cycle.id
    )
    no_show = count_lessons_no_show(
        db, organization_id=cycle.organization_id, cycle_id=cycle.id
    )
    if today is None:
        today = _org_today(db, cycle.organization_id)
    return _cycle_out(
        cycle, today, lessons_completed=completed, lessons_no_show=no_show
    )


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
