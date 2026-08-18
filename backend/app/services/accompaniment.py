"""Canonical accompaniment preparation state: checklist + live entities.

Resolver precedence (highest first):
1. Real operational entity (evaluation/plan/cycle/agenda complete) → done
2. Explicit stored `na`
3. Explicit stored `later`
4. Explicit stored `done` (user marked complete without entity)
5. Default `todo`

A later real entity always wins over an older `na`/`later`.
Absence of an entity never clears `na` or `later`.
Cancelled/ended cycles are not operational current cycles.
Partial agenda (fewer appointments than lesson_count) is not complete.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.intake import ClientIntakeSubmission, ClientJourney
from app.models.organization import Organization
from app.services import cycle_period as cycle_period_svc
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
AGENDA_COUNT_STATUSES = frozenset({"scheduled", "completed", "no_show"})
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
    return cycle_period_svc.pick_operational_cycle(rows, today)


def count_cycle_agenda_slots(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
) -> int:
    """Distinct valid lessons for this cycle/tenant.

    Counts scheduled/completed/no_show only. Cancelled rows and appointments of
    other cycles (including manual bookings with cycle_id null) are excluded.
    Duplicate rows sharing starts_at count as one: a single cycle never generates
    two legitimate lessons at the same instant (see build_occurrences).
    Appointment status has no `archived` value; cancelled covers withdrawn lessons.
    """
    return int(
        db.scalar(
            select(func.count(func.distinct(Appointment.starts_at))).where(
                Appointment.organization_id == organization_id,
                Appointment.cycle_id == cycle_id,
                Appointment.status.in_(AGENDA_COUNT_STATUSES),
            )
        )
        or 0
    )


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
        appt_count = count_cycle_agenda_slots(
            db, organization_id=organization_id, cycle_id=cycle.id
        )

    expected = int(cycle.lesson_count or 0) if cycle else 0
    agenda_complete = bool(cycle and expected > 0 and appt_count >= expected)
    anamnesis_done = bool(journey and journey.anamnesis_reviewed_at) or stored.get(
        "anamnesis"
    ) == "done"
    has_intake_submission = (
        db.scalar(
            select(ClientIntakeSubmission.id)
            .where(
                ClientIntakeSubmission.organization_id == organization_id,
                ClientIntakeSubmission.client_id == client_id,
            )
            .limit(1)
        )
        is not None
    )
    # A client added directly by the professional (not via the public intake
    # link) never has a submission to review — "todo" would block the
    # checklist forever, since nothing can ever make it "done". Treat that
    # absence as "não se aplica" unless the professional stored something
    # else explicitly (na/later/done still win, same as every other step).
    anamnesis_default = "todo" if has_intake_submission else "na"

    steps = {
        "anamnesis": (
            "done"
            if anamnesis_done
            else _merge(stored.get("anamnesis") or anamnesis_default, fact_done=False)
        ),
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
        "anamnesis": (
            "Analisada"
            if steps["anamnesis"] == "done"
            else "Cliente cadastrado diretamente, sem formulário"
            if steps["anamnesis"] == "na" and not has_intake_submission
            else None
        ),
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
        last = cycle_period_svc.last_inclusive_on(cycle.ends_on)
        summaries["cycle"] = (
            f"{service} · {cycle.starts_on.strftime('%d/%m')} a {last.strftime('%d/%m')}"
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
    flag_modified(journey, "accompaniment_checklist")
    if step == "anamnesis" and status == "done" and journey.anamnesis_reviewed_at is None:
        journey.anamnesis_reviewed_at = datetime.now(UTC)
    resolved = resolve_accompaniment(
        db,
        organization_id=organization_id,
        client_id=client_id,
        journey=journey,
    )
    journey.next_action = resolved["next_action"] or "prepare_accompaniment"
    db.add(journey)
    db.commit()
    db.refresh(journey)
    return journey
