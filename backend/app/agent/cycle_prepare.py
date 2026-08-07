"""Deterministic cycle proposal preparation for the assistant (server-side)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.cycle_template import CycleTemplate
from app.models.service import Service
from app.services import cycle_calc
from app.services import cycle_intelligence as ci_svc
from app.services import cycle_schedule as schedule_svc
from app.services import domain as domain_svc
from app.services.auth import AuthError


def _norm(text: str) -> str:
    t = text.strip().lower()
    for a, b in (
        ("á", "a"),
        ("à", "a"),
        ("ã", "a"),
        ("â", "a"),
        ("é", "e"),
        ("ê", "e"),
        ("í", "i"),
        ("ó", "o"),
        ("ô", "o"),
        ("õ", "o"),
        ("ú", "u"),
        ("ç", "c"),
    ):
        t = t.replace(a, b)
    return re.sub(r"\s+", " ", t)


def find_clients_by_name(
    db: Session, *, organization_id: uuid.UUID, query: str, limit: int = 8
) -> list[Client]:
    q = _norm(query)
    rows = list(
        db.scalars(
            select(Client).where(
                Client.organization_id == organization_id,
                Client.status == "active",
            )
        ).all()
    )
    scored: list[tuple[int, Client]] = []
    for row in rows:
        name = _norm(row.full_name)
        if name == q:
            scored.append((0, row))
        elif q in name or name in q:
            scored.append((1, row))
        elif any(part and part in name for part in q.split()):
            scored.append((2, row))
    scored.sort(key=lambda x: (x[0], x[1].full_name.lower()))
    return [c for _, c in scored[:limit]]


def find_services_by_name(
    db: Session, *, organization_id: uuid.UUID, query: str, limit: int = 8
) -> list[Service]:
    q = _norm(query)
    rows = domain_svc.list_services(db, organization_id=organization_id, status="active")
    scored: list[tuple[int, Service]] = []
    for row in rows:
        name = _norm(row.name)
        if name == q:
            scored.append((0, row))
        elif q in name or name in q:
            scored.append((1, row))
    scored.sort(key=lambda x: (x[0], x[1].name.lower()))
    return [s for _, s in scored[:limit]]


def find_templates_by_name(
    db: Session, *, organization_id: uuid.UUID, query: str, limit: int = 8
) -> list[CycleTemplate]:
    q = _norm(query)
    rows = ci_svc.list_templates(db, organization_id=organization_id, status="active")
    scored: list[tuple[int, CycleTemplate]] = []
    for row in rows:
        name = _norm(row.name)
        if name == q:
            scored.append((0, row))
        elif q in name or name in q:
            scored.append((1, row))
    scored.sort(key=lambda x: (x[0], x[1].name.lower()))
    return [t for _, t in scored[:limit]]


def estimate_planned_sessions(*, weekly_frequency: int, duration_days: int) -> int:
    weeks = max(1, duration_days // 7)
    return max(1, weekly_frequency * weeks)


def compute_ends_on(*, starts_on: date, duration_type: str, duration_value: int) -> date:
    """Exclusive renewal date — same convention as intelligent cycles / cycle_calc."""
    return cycle_calc.compute_renewal_on(
        starts_on=starts_on,
        duration_type=duration_type,
        duration_value=duration_value,
    )


def format_brl(cents: int | None) -> str:
    if cents is None:
        return "—"
    return f"R$ {cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


@dataclass
class CyclePrepResult:
    status: str
    payload: dict[str, Any]


def prepare_cycle_proposal(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID | None = None,
    client_name: str | None = None,
    service_id: uuid.UUID | None = None,
    service_or_template_name: str | None = None,
    starts_on: date | None = None,
    weekly_frequency: int | None = None,
    value_cents: int | None = None,
    adjustment_cents: int | None = None,
    today: date | None = None,
    weekdays: list[int] | None = None,
    starts_time: str | None = None,
    schedule_slots: list[dict[str, Any]] | None = None,
    skip_schedule: bool = False,
) -> CyclePrepResult:
    today = today or date.today()

    # --- resolve client ---
    client: Client | None = None
    if client_id is not None:
        client = domain_svc.get_client(
            db, organization_id=organization_id, client_id=client_id
        )
    elif client_name:
        matches = find_clients_by_name(
            db, organization_id=organization_id, query=client_name
        )
        if len(matches) == 0:
            return CyclePrepResult(
                status="need_clarification",
                payload={
                    "missing": ["client"],
                    "message": f"Não encontrei cliente correspondente a “{client_name}”.",
                },
            )
        if len(matches) > 1:
            return CyclePrepResult(
                status="need_clarification",
                payload={
                    "missing": ["client"],
                    "message": "Há mais de um cliente possível. Qual deles?",
                    "candidates": [
                        {"id": str(c.id), "full_name": c.full_name} for c in matches
                    ],
                },
            )
        client = matches[0]
    else:
        return CyclePrepResult(
            status="need_clarification",
            payload={
                "missing": ["client"],
                "message": "Para quem é o ciclo? Informe o cliente.",
            },
        )

    # --- resolve service / template ---
    service: Service | None = None
    template: CycleTemplate | None = None
    if service_id is not None:
        service = domain_svc.get_service(
            db, organization_id=organization_id, service_id=service_id
        )
    name_q = (service_or_template_name or "").strip()
    if service is None and name_q:
        services = find_services_by_name(
            db, organization_id=organization_id, query=name_q
        )
        templates = find_templates_by_name(
            db, organization_id=organization_id, query=name_q
        )
        if len(services) > 1:
            return CyclePrepResult(
                status="need_clarification",
                payload={
                    "missing": ["service"],
                    "message": "Há mais de um serviço parecido. Qual usar?",
                    "candidates": [{"id": str(s.id), "name": s.name} for s in services],
                },
            )
        if len(services) == 1:
            service = services[0]
        if len(templates) == 1:
            template = templates[0]
        elif len(templates) > 1 and service is None:
            return CyclePrepResult(
                status="need_clarification",
                payload={
                    "missing": ["service"],
                    "message": "Há mais de um modelo de ciclo parecido. Qual usar?",
                    "candidates": [{"id": str(t.id), "name": t.name} for t in templates],
                },
            )
        if service is None and template is not None:
            # Prefer a service with the same name; else first active service as fallback is unsafe —
            # ask for service if template found without service.
            same = find_services_by_name(
                db, organization_id=organization_id, query=template.name
            )
            if len(same) == 1:
                service = same[0]
            elif len(same) == 0:
                active = domain_svc.list_services(
                    db, organization_id=organization_id, status="active"
                )
                if len(active) == 1:
                    service = active[0]
                else:
                    return CyclePrepResult(
                        status="need_clarification",
                        payload={
                            "missing": ["service"],
                            "message": (
                                f"Encontrei o modelo “{template.name}”, mas preciso do serviço "
                                "cobrado (preço). Qual serviço usar?"
                            ),
                        },
                    )
        if service is None and template is None:
            return CyclePrepResult(
                status="need_clarification",
                payload={
                    "missing": ["service"],
                    "message": f"Não encontrei serviço ou modelo “{name_q}”.",
                },
            )

    if service is None:
        return CyclePrepResult(
            status="need_clarification",
            payload={
                "missing": ["service"],
                "message": "Qual serviço ou modelo de ciclo usar?",
            },
        )

    if template is None:
        # Match template by service name if unique
        tmatches = find_templates_by_name(
            db, organization_id=organization_id, query=service.name
        )
        if len(tmatches) == 1:
            template = tmatches[0]

    duration_type = template.duration_type if template else "fixed_days"
    duration_value = (
        template.duration_value if template else int(service.default_duration_days or 30)
    )
    freq = weekly_frequency
    if freq is None and template is not None:
        freq = template.weekly_frequency
    if freq is None:
        # Not on service — only ask if truly unknown after template lookup
        freq = None

    # Without weekdays, assistant uses package value = service.default_price (legacy create_cycle).
    # Manual intelligent flow multiplies unit×aulas only after weekdays are chosen.
    price = value_cents if value_cents is not None else service.default_price_cents
    adj = adjustment_cents if adjustment_cents is not None else 0
    if adj > 0:
        adj = -abs(adj)
    final_cents = (price or 0) + adj if price is not None else None

    # Active cycles
    active = domain_svc.list_cycles(
        db, organization_id=organization_id, client_id=client.id, status="active"
    )
    active_payload = [
        {
            "id": str(c.id),
            "service_name": c.service_name,
            "starts_on": c.starts_on.isoformat(),
            "ends_on": c.ends_on.isoformat(),
            "is_legacy": c.is_legacy,
        }
        for c in active
    ]

    missing: list[str] = []
    if starts_on is None:
        missing.append("starts_on")
    if freq is None:
        missing.append("weekly_frequency")
    if price is None:
        missing.append("value_cents")

    cleaned_weekdays = sorted({int(d) for d in (weekdays or []) if 0 <= int(d) <= 6})
    slots_payload = schedule_slots
    has_times = bool(slots_payload) or bool(starts_time)

    defaults_human = {
        "service_name": service.name,
        "weekly_frequency": freq,
        "duration_type": duration_type,
        "duration_value": duration_value,
        "duration_days_estimate": duration_value if duration_type == "fixed_days" else None,
        "value_cents": price,
        "value_label": format_brl(price),
        "lesson_duration_minutes": service.default_duration_minutes,
        "template_name": template.name if template else None,
    }

    # Active cycle conflict as soon as starts_on is known
    if starts_on is not None:
        for c in active:
            active_last = c.ends_on
            if not c.is_legacy:
                active_last = c.ends_on - timedelta(days=1)
            if active_last >= starts_on:
                renew_start = active_last + timedelta(days=1)
                return CyclePrepResult(
                    status="conflict",
                    payload={
                        "message": (
                            f"{client.full_name} possui um ciclo ativo até "
                            f"{_fmt_date(active_last)}. O novo ciclo deve começar em "
                            f"{_fmt_date(renew_start)} como renovação?"
                        ),
                        "active_cycles": active_payload,
                        "suggested_starts_on": renew_start.isoformat(),
                        "defaults": defaults_human,
                        "client": {"id": str(client.id), "full_name": client.full_name},
                        "service": {"id": str(service.id), "name": service.name},
                    },
                )

    if (
        not skip_schedule
        and starts_on is not None
        and freq is not None
        and price is not None
    ):
        if not cleaned_weekdays:
            missing.append("weekdays")
        elif freq is not None and len(cleaned_weekdays) != freq:
            return CyclePrepResult(
                status="need_input",
                payload={
                    "missing": ["weekdays"],
                    "message": (
                        f"Para {freq} aulas por semana, informe exatamente {freq} dia(s). "
                        f"Em quais dias e horários o {client.full_name} terá aula?"
                    ),
                    "defaults": defaults_human,
                    "client": {"id": str(client.id), "full_name": client.full_name},
                    "service": {"id": str(service.id), "name": service.name},
                    "suggested_starts_on": today.isoformat(),
                    "active_cycles": active_payload,
                },
            )
        elif not has_times:
            missing.append("starts_time")

    if missing:
        ask_bits = []
        if "starts_on" in missing:
            ask_bits.append(
                f"Quando começa o ciclo do {client.full_name}? Posso iniciar hoje, "
                f"{today.day} de {_month_pt(today.month)}."
            )
        if "weekly_frequency" in missing:
            ask_bits.append("Quantas aulas por semana?")
        if "value_cents" in missing:
            ask_bits.append("Qual o valor do ciclo?")
        if "weekdays" in missing:
            ask_bits.append(
                f"Em quais dias e horários o {client.full_name} terá aula?"
            )
        if "starts_time" in missing:
            days_txt = ", ".join(
                schedule_svc.WEEKDAY_LABELS_PT[d] for d in cleaned_weekdays
            )
            ask_bits.append(f"Qual será o horário das aulas de {days_txt}?")
        msg = " ".join(ask_bits)
        if active_payload and "starts_on" in missing:
            last = active_payload[0]
            msg = (
                f"{client.full_name} possui ciclo ativo até "
                f"{_fmt_date(date.fromisoformat(last['ends_on']))}. "
                + msg
            )
        known = []
        if freq:
            known.append(f"{freq} vezes por semana")
        if duration_type == "fixed_days":
            known.append(f"{duration_value} dias")
        elif duration_type == "calendar_months":
            known.append(f"{duration_value} mês(es)")
        if price is not None:
            known.append(format_brl(price))
        if known and "weekdays" not in missing and "starts_time" not in missing:
            msg = f"Encontrei {service.name}: {', '.join(known)}. " + msg
        elif known and ("weekdays" in missing or "starts_time" in missing):
            msg = f"Encontrei {service.name}: {', '.join(known)}. " + msg
        return CyclePrepResult(
            status="need_input",
            payload={
                "missing": missing,
                "message": msg,
                "defaults": defaults_human,
                "client": {"id": str(client.id), "full_name": client.full_name},
                "service": {"id": str(service.id), "name": service.name},
                "template": (
                    {
                        "id": str(template.id),
                        "name": template.name,
                        "weekly_frequency": template.weekly_frequency,
                    }
                    if template
                    else None
                ),
                "active_cycles": active_payload,
                "suggested_starts_on": today.isoformat(),
                "weekdays": cleaned_weekdays or None,
            },
        )

    assert starts_on is not None and freq is not None
    ends_on = compute_ends_on(
        starts_on=starts_on, duration_type=duration_type, duration_value=duration_value
    )
    last_inclusive = ends_on - timedelta(days=1)
    duration_minutes = service.default_duration_minutes or 60
    tz = schedule_svc.org_timezone(db, organization_id)

    # Schedule required for session-based cycles (default path)
    if skip_schedule:
        duration_days = max(1, (ends_on - starts_on).days)
        planned = estimate_planned_sessions(
            weekly_frequency=freq, duration_days=duration_days
        )
        valor_label = format_brl(final_cents if final_cents is not None else price)
        draft = {
            "client_id": str(client.id),
            "client_name": client.full_name,
            "service_id": str(service.id),
            "service_name": service.name,
            "cycle_template_id": str(template.id) if template else None,
            "template_name": template.name if template else None,
            "starts_on": starts_on.isoformat(),
            "ends_on": ends_on.isoformat(),
            "weekly_frequency": freq,
            "planned_sessions": planned,
            "lesson_count": planned,
            "duration_type": duration_type,
            "duration_value": duration_value,
            "value_cents": final_cents if final_cents is not None else price,
            "adjustment_cents": adj,
            "final_cents": final_cents,
            "receivable_due_on": starts_on.isoformat(),
            "create_receivable": True,
            "creates_appointments": False,
            "lesson_duration_minutes": duration_minutes,
            "summary_lines": {
                "Cliente": client.full_name,
                "Serviço": service.name,
                "Período": f"{_fmt_date(starts_on)} a {_fmt_date(last_inclusive)}",
                "Frequência": f"{freq} aulas por semana — {planned} aulas previstas",
                "Valor": valor_label,
                "Vencimento": _fmt_date(starts_on),
                "Agenda": "Sem agenda (exceção explícita).",
            },
        }
        return CyclePrepResult(status="ready", payload={"draft": draft, "message": None})

    try:
        slots = schedule_svc.slots_from_payload(
            cleaned_weekdays,
            starts_time=starts_time,
            schedule_slots=slots_payload,
        )
    except (AuthError, ValueError, KeyError, TypeError) as exc:
        return CyclePrepResult(
            status="need_input",
            payload={
                "missing": ["starts_time"],
                "message": (
                    str(getattr(exc, "message", None) or exc)
                    or f"Qual será o horário das aulas do {client.full_name}?"
                ),
                "defaults": defaults_human,
                "client": {"id": str(client.id), "full_name": client.full_name},
                "service": {"id": str(service.id), "name": service.name},
                "weekdays": cleaned_weekdays,
            },
        )

    occurrences = schedule_svc.build_occurrences(
        starts_on=starts_on,
        ends_on=ends_on,
        slots=slots,
        duration_minutes=duration_minutes,
        tz=tz,
    )
    planned = len(occurrences)
    if planned < 1:
        return CyclePrepResult(
            status="need_input",
            payload={
                "missing": ["weekdays"],
                "message": (
                    "Nenhuma aula cai neste período com os dias escolhidos. "
                    "Ajuste os dias ou o período."
                ),
                "defaults": defaults_human,
                "client": {"id": str(client.id), "full_name": client.full_name},
                "service": {"id": str(service.id), "name": service.name},
            },
        )

    hits = schedule_svc.find_occurrence_conflicts(
        db, organization_id=organization_id, occurrences=occurrences
    )
    schedule_lines = schedule_svc.format_schedule_lines(slots, duration_minutes)
    occurrence_labels = [
        schedule_svc.format_occurrence_label(o, tz) for o in occurrences
    ]

    if hits:
        conflict_labels = [
            schedule_svc.format_occurrence_label(h.occurrence, tz) for h in hits
        ]
        preferred = slots[0].starts_time
        alts = schedule_svc.suggest_recurring_times(
            db,
            organization_id=organization_id,
            starts_on=starts_on,
            ends_on=ends_on,
            weekdays=cleaned_weekdays,
            duration_minutes=duration_minutes,
            tz=tz,
            preferred=preferred,
        )
        free_count = planned - len(hits)
        first = conflict_labels[0]
        msg = (
            f"Encontrei conflito em {first}. "
            f"{free_count} de {planned} horários estão livres."
        )
        if alts:
            msg += " Alternativas livres em todas as semanas: " + "; ".join(alts[:3]) + "."
        return CyclePrepResult(
            status="schedule_conflict",
            payload={
                "message": msg,
                "conflicts": conflict_labels,
                "conflict_count": len(hits),
                "occurrence_count": planned,
                "suggestions": alts,
                "occurrence_dates": occurrence_labels,
                "schedule_lines": schedule_lines,
                "defaults": defaults_human,
                "client": {"id": str(client.id), "full_name": client.full_name},
                "service": {"id": str(service.id), "name": service.name},
                "weekdays": cleaned_weekdays,
            },
        )

    valor_label = format_brl(final_cents if final_cents is not None else price)
    if adj:
        valor_label = (
            f"{format_brl(price)} (desconto {format_brl(abs(adj))}) → {format_brl(final_cents)}"
        )

    slots_json = [
        {
            "weekday": s.weekday,
            "starts_time": s.starts_time.strftime("%H:%M:%S"),
        }
        for s in slots
    ]
    draft = {
        "client_id": str(client.id),
        "client_name": client.full_name,
        "service_id": str(service.id),
        "service_name": service.name,
        "cycle_template_id": str(template.id) if template else None,
        "template_name": template.name if template else None,
        "starts_on": starts_on.isoformat(),
        "ends_on": ends_on.isoformat(),
        "weekly_frequency": freq,
        "weekdays": cleaned_weekdays,
        "schedule_slots": slots_json,
        "starts_time": slots[0].starts_time.strftime("%H:%M:%S"),
        "planned_sessions": planned,
        "lesson_count": planned,
        "duration_type": duration_type,
        "duration_value": duration_value,
        "value_cents": final_cents if final_cents is not None else price,
        "adjustment_cents": adj,
        "final_cents": final_cents,
        "receivable_due_on": starts_on.isoformat(),
        "create_receivable": True,
        "creates_appointments": True,
        "generate_appointments": True,
        "lesson_duration_minutes": duration_minutes,
        "occurrence_dates": occurrence_labels,
        "schedule_lines": schedule_lines,
        "summary_lines": {
            "Cliente": client.full_name,
            "Serviço": service.name,
            "Período": f"{_fmt_date(starts_on)} a {_fmt_date(last_inclusive)}",
            "Frequência": f"{freq} aulas por semana",
            "Quantidade": f"{planned} aulas previstas",
            "Programação": "; ".join(schedule_lines),
            "Valor": valor_label,
            "Vencimento": _fmt_date(starts_on),
            "Agenda": f"{planned} compromissos serão criados",
            "Conflitos": "nenhum",
        },
    }
    return CyclePrepResult(status="ready", payload={"draft": draft, "message": None})


_MONTHS = (
    "",
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)


def _month_pt(m: int) -> str:
    return _MONTHS[m]


def _fmt_date(d: date) -> str:
    return f"{d.day} de {_month_pt(d.month)} de {d.year}"
