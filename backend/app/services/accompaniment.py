"""Canonical accompaniment preparation state: checklist + live entities."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.intake import ClientJourney
from app.models.organization import Organization
from app.services import evaluations as eval_svc
from app.services import journey as journey_svc
from app.services import protocols as proto_svc
from app.services.auth import AuthError

STEP_KEYS = (
    "anamnesis",
    "evaluation",
    "plan",
    "cycle",
    "agenda",
    "routine",
    "activate",
)
VALID_STATUSES = {"todo", "done", "later", "na"}

NEXT_BY_STEP = {
    "anamnesis": "review_anamnesis",
    "evaluation": "register_evaluation",
    "plan": "create_plan",
    "cycle": "create_cycle",
    "agenda": "organize_agenda",
    "routine": "configure_routine",
    "activate": "activate_accompaniment",
}


def _today(db: Session, organization_id: uuid.UUID) -> date:
    org = db.get(Organization, organization_id)
    tz_name = org.timezone if org and org.timezone else "America/Sao_Paulo"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("America/Sao_Paulo")
    return datetime.now(tz).date()


def _pick_cycle(
    rows: list[Cycle], today: date
) -> Cycle | None:
    operational = [c for c in rows if c.status in {"active", "paused"}]
    current = [
        c
        for c in operational
        if c.starts_on <= today and c.ends_on >= today
    ]
    if current:
        return sorted(current, key=lambda c: c.starts_on)[0]
    upcoming = [c for c in operational if c.starts_on > today]
    if upcoming:
        return sorted(upcoming, key=lambda c: c.starts_on)[0]
    return None


def _merge(stored: str | None, *, fact_done: bool) -> str:
    value = stored if stored in VALID_STATUSES else "todo"
    if fact_done:
        return "done"
    if value in {"na", "later"}:
        return value
    return value


def resolve_accompaniment(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    journey: ClientJourney | None = None,
) -> dict[str, Any]:
    if journey is None:
        journey = journey_svc.get_journey(
            db, organization_id=organization_id, client_id=client_id
        )
    stored = dict((journey.accompaniment_checklist or {}) if journey else {})
    today = _today(db, organization_id)

    evals = eval_svc.list_client_evaluations(
        db, organization_id=organization_id, client_id=client_id
    )
    protocols = proto_svc.list_protocols(
        db, organization_id=organization_id, client_id=client_id
    )
    published = next((p for p in protocols if p.status == "published"), None)
    cycles = list(
        db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == organization_id,
                Cycle.client_id == client_id,
            )
            .options(selectinload(Cycle.service))
        ).all()
    )
    cycle = _pick_cycle(cycles, today)
    appt_count = 0
    if cycle is not None:
        appt_count = int(
            db.scalar(
                select(func.count()).select_from(Appointment).where(
                    Appointment.organization_id == organization_id,
                    Appointment.cycle_id == cycle.id,
                    Appointment.status != "cancelled",
                )
            )
            or 0
        )

    expected = int(cycle.lesson_count or 0) if cycle else 0
    agenda_complete = bool(cycle and expected > 0 and appt_count >= expected)
    anamnesis_done = bool(journey and journey.anamnesis_reviewed_at) or stored.get(
        "anamnesis"
    ) == "done"

    steps = {
        "anamnesis": "done" if anamnesis_done else _merge(stored.get("anamnesis"), fact_done=False),
        "evaluation": _merge(
            stored.get("evaluation")
            or (
                "na"
                if journey and journey.evaluation_decision in {"waived", "external"}
                else None
            ),
            fact_done=len(evals) > 0 or (journey and journey.evaluation_decision == "completed"),
        ),
        "plan": _merge(
            stored.get("plan")
            or ("na" if journey and journey.protocol_decision == "waived" else None),
            fact_done=published is not None or (journey and journey.protocol_decision == "published"),
        ),
        "cycle": _merge(stored.get("cycle"), fact_done=cycle is not None),
        "agenda": _merge(stored.get("agenda"), fact_done=agenda_complete),
        "routine": _merge(stored.get("routine"), fact_done=False),
        "activate": _merge(
            stored.get("activate"),
            fact_done=bool(journey and journey.stage == "active"),
        ),
    }

    summaries: dict[str, str | None] = {
        "anamnesis": "Analisada" if steps["anamnesis"] == "done" else None,
        "evaluation": None,
        "plan": published.title if published else None,
        "cycle": None,
        "agenda": None,
        "routine": None,
        "activate": None,
    }
    if steps["evaluation"] == "na":
        summaries["evaluation"] = "Não será utilizada neste acompanhamento"
    elif evals:
        summaries["evaluation"] = "Registro existente"
    if cycle is not None:
        service = cycle.service.name if cycle.service else "Ciclo"
        summaries["cycle"] = (
            f"{service} · {cycle.starts_on.strftime('%d/%m')} a {cycle.ends_on.strftime('%d/%m')}"
        )
        if agenda_complete:
            summaries["agenda"] = f"{appt_count} aulas na agenda"
        elif appt_count:
            summaries["agenda"] = f"{appt_count} de {expected or appt_count} aulas"
        elif expected:
            summaries["agenda"] = f"Defina os horários das {expected} aulas"
    if steps["routine"] == "na":
        summaries["routine"] = "Não será utilizada neste acompanhamento"

    next_key = None
    for key in STEP_KEYS:
        if steps[key] == "todo":
            next_key = key
            break
    if next_key is None:
        for key in STEP_KEYS:
            if steps[key] == "later":
                next_key = key
                break

    defined = sum(1 for k in STEP_KEYS if k != "activate" and steps[k] != "todo")
    total = len(STEP_KEYS) - 1

    return {
        "checklist": steps,
        "summaries": summaries,
        "next_step": next_key,
        "next_action": NEXT_BY_STEP.get(next_key) if next_key else None,
        "progress_defined": defined,
        "progress_total": total,
        "cycle_id": str(cycle.id) if cycle else None,
        "appointment_count": appt_count,
        "expected_lessons": expected or None,
    }


def apply_step(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    step: str,
    status: str,
) -> ClientJourney:
    if step not in STEP_KEYS:
        raise AuthError("invalid_step", "Etapa inválida.", 422)
    if status not in VALID_STATUSES:
        raise AuthError("invalid_status", "Estado inválido.", 422)
    journey = journey_svc.ensure_legacy_active_journey(
        db, organization_id=organization_id, client_id=client_id
    )
    current = dict(journey.accompaniment_checklist or {})
    current[step] = status
    journey.accompaniment_checklist = current
    if step == "anamnesis" and status == "done" and journey.anamnesis_reviewed_at is None:
        journey.anamnesis_reviewed_at = datetime.now(UTC)
    resolved = resolve_accompaniment(
        db,
        organization_id=organization_id,
        client_id=client_id,
        journey=journey,
    )
    journey.accompaniment_checklist = resolved["checklist"]
    journey.next_action = resolved["next_action"] or "prepare_accompaniment"
    db.add(journey)
    db.commit()
    db.refresh(journey)
    return journey
