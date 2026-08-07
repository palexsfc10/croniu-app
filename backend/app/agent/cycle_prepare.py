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
from app.services import domain as domain_svc


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
        msg = " ".join(ask_bits)
        if active_payload:
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
        if known:
            msg = (
                f"Encontrei {service.name}: {', '.join(known)}. " + msg
            )
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
            },
        )

    assert starts_on is not None and freq is not None
    ends_on = compute_ends_on(
        starts_on=starts_on, duration_type=duration_type, duration_value=duration_value
    )
    # Exclusive ends_on: period length in days == (ends - starts).days (fixed_days).
    duration_days = max(1, (ends_on - starts_on).days)
    planned = estimate_planned_sessions(
        weekly_frequency=freq, duration_days=duration_days
    )
    last_inclusive = ends_on - timedelta(days=1)

    conflict = None
    for c in active:
        # Intelligent cycles store exclusive ends_on; legacy may store inclusive.
        active_last = c.ends_on
        if not c.is_legacy:
            active_last = c.ends_on - timedelta(days=1)
        if active_last >= starts_on:
            renew_start = active_last + timedelta(days=1)
            conflict = {
                "id": str(c.id),
                "ends_on": c.ends_on.isoformat(),
                "active_last_day": active_last.isoformat(),
                "message": (
                    f"{client.full_name} possui um ciclo ativo até "
                    f"{_fmt_date(active_last)}. O novo ciclo deve começar em "
                    f"{_fmt_date(renew_start)} como renovação?"
                ),
                "suggested_starts_on": renew_start.isoformat(),
            }
            break

    if conflict and starts_on <= date.fromisoformat(conflict["active_last_day"]):
        return CyclePrepResult(
            status="conflict",
            payload={
                "message": conflict["message"],
                "active_cycles": active_payload,
                "suggested_starts_on": conflict["suggested_starts_on"],
                "defaults": defaults_human,
                "client": {"id": str(client.id), "full_name": client.full_name},
                "service": {"id": str(service.id), "name": service.name},
            },
        )

    valor_label = format_brl(final_cents if final_cents is not None else price)
    if adj:
        valor_label = (
            f"{format_brl(price)} (desconto {format_brl(abs(adj))}) → {format_brl(final_cents)}"
        )

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
        "lesson_duration_minutes": service.default_duration_minutes,
        "summary_lines": {
            "Cliente": client.full_name,
            "Serviço": service.name,
            "Período": f"{_fmt_date(starts_on)} a {_fmt_date(last_inclusive)}",
            "Frequência": f"{freq} aulas por semana — {planned} aulas previstas",
            "Valor": valor_label,
            "Vencimento": _fmt_date(starts_on),
            "Agenda": "Sem compromissos (informe dias e horários para gerar agenda).",
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
