"""Renewal case management — the professional-side renewal process.

Distinct from `renewal_requests` (a portal-submitted client signal — see
`app/services/my_cycle.py`): a `RenewalCase` row is created lazily, only on
the first real action taken against a cycle's renewal (marking "aguardando
cliente", closing without renewal, or creating the successor cycle). A cycle
that is merely nearing its end with no action taken yet has NO case row —
its "próxima"/"pendente"/"atrasada" display state is derived purely from the
cycle's own dates, exactly as before this feature existed. This means no
existing account ever receives a case row it didn't earn through a real,
explicit action — never a blind backfill.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.cycle import Cycle
from app.models.renewal_case import RenewalCase
from app.models.renewal_request import RenewalRequest
from app.schemas.renewal_case import RenewalCaseView
from app.services import cycle_period as cycle_period_svc
from app.services import domain as domain_svc
from app.services.auth import AuthError

OPEN_CASE_STATUSES = {"open", "awaiting_client"}
TERMINAL_CASE_STATUSES = {"renewed", "ended_without_renewal"}
# "upcoming" (>7 days out, no client-initiated signal) is informational only
# — it must never enter the "needs_decision" queue alongside the terminal
# statuses. Kept separate from TERMINAL_CASE_STATUSES because callers that
# want the full history (scope="all") still need to distinguish "resolved"
# from "just not urgent yet".
NON_DECISION_STATUSES = TERMINAL_CASE_STATUSES | {"upcoming"}


def _display_status(
    *,
    cycle: Cycle,
    case: RenewalCase | None,
    today: date,
    days_remaining: int,
    lessons_remaining: int | None,
    portal_requested: bool,
) -> str:
    if case is not None and case.status == "renewed":
        return "renewed"
    if case is not None and case.status == "ended_without_renewal":
        return "ended_without_renewal"

    ended = cycle.status != "active" or cycle_period_svc.is_elapsed(
        ends_on=cycle.ends_on, today=today
    )
    if ended:
        return "overdue"

    if case is not None and case.status == "awaiting_client":
        return "awaiting_client"
    # Legacy signal from before this feature: a professional-confirmed
    # contact with no case row yet reads the same as "awaiting_client" —
    # display-only, never written back.
    if case is None and cycle.contact_confirmed_at is not None:
        return "awaiting_client"

    # The client explicitly asked, through the Portal, to renew — that's a
    # decision waiting on the professional regardless of how far out the
    # cycle actually ends.
    if portal_requested:
        return "requested"

    lessons_low = lessons_remaining is not None and lessons_remaining <= domain_svc.LESSONS_NEARING_REMAINING
    if lessons_low or (0 <= days_remaining <= domain_svc.HOME_CYCLE_ENDING_WINDOW_DAYS):
        return "pending"
    return "upcoming"


def _has_newer_active_successor(cycle: Cycle, active_by_client_service: dict) -> bool:
    key = (cycle.client_id, cycle.service_id)
    siblings = active_by_client_service.get(key, [])
    for other in siblings:
        if other.id == cycle.id:
            continue
        if other.starts_on >= cycle.starts_on and other.created_at >= cycle.created_at:
            return True
    return False


def list_renewal_cases(
    db: Session,
    *,
    organization_id: uuid.UUID,
    today: date,
    scope: str = "needs_decision",
) -> list[RenewalCaseView]:
    """`scope="needs_decision"` (default) — upcoming/pending/awaiting/overdue
    only, for Home and the compact surfaces. `scope="all"` — the full Central
    de Renovações view, including resolved cases (renewed/ended without
    renewal) for history.
    """
    cycles = list(
        db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == organization_id,
                Cycle.status != "cancelled",
            )
            .options(selectinload(Cycle.client), selectinload(Cycle.service))
        ).all()
    )
    if not cycles:
        return []

    cases = list(
        db.scalars(
            select(RenewalCase).where(RenewalCase.organization_id == organization_id)
        ).all()
    )
    case_by_source = {c.source_cycle_id: c for c in cases}

    progress = domain_svc.map_lesson_progress(
        db, organization_id=organization_id, cycle_ids=[c.id for c in cycles]
    )

    open_requests = list(
        db.scalars(
            select(RenewalRequest).where(
                RenewalRequest.organization_id == organization_id,
                RenewalRequest.status.in_(("requested", "acknowledged", "payment_reported")),
            )
        ).all()
    )
    portal_requested_cycle_ids = {r.source_cycle_id for r in open_requests}

    active_by_client_service: dict[tuple, list[Cycle]] = {}
    for c in cycles:
        if c.status != "active":
            continue
        active_by_client_service.setdefault((c.client_id, c.service_id), []).append(c)

    views: list[RenewalCaseView] = []
    for cycle in cycles:
        case = case_by_source.get(cycle.id)
        lessons_completed, _no_show = progress.get(cycle.id, (0, 0))
        lessons_remaining = (
            max(0, cycle.lesson_count - lessons_completed) if cycle.lesson_count is not None else None
        )
        days_remaining = (cycle.ends_on - today).days
        is_nearing = (
            cycle.status == "active"
            and cycle_period_svc.is_current(starts_on=cycle.starts_on, ends_on=cycle.ends_on, today=today)
            and (
                (1 <= days_remaining <= domain_svc.NEARING_END_DAYS)
                or (lessons_remaining is not None and lessons_remaining <= domain_svc.LESSONS_NEARING_REMAINING)
            )
        )
        ended_candidate = cycle.status == "ended" or cycle_period_svc.is_elapsed(
            ends_on=cycle.ends_on, today=today
        )
        portal_requested = cycle.id in portal_requested_cycle_ids

        has_case = case is not None
        eligible = has_case or is_nearing or ended_candidate or portal_requested
        if not eligible:
            continue

        # A newer active successor for the same client+service already
        # covers this cycle's renewal — never nag about the older one,
        # unless it already has its own explicit case row (history) or the
        # client themselves asked to renew this specific cycle.
        if (
            not has_case
            and not portal_requested
            and _has_newer_active_successor(cycle, active_by_client_service)
        ):
            continue

        status = _display_status(
            cycle=cycle,
            case=case,
            today=today,
            days_remaining=days_remaining,
            lessons_remaining=lessons_remaining,
            portal_requested=portal_requested,
        )
        if scope == "needs_decision" and status in NON_DECISION_STATUSES:
            continue

        views.append(
            RenewalCaseView(
                case_id=case.id if case else None,
                client_id=cycle.client_id,
                client_name=cycle.client.full_name if cycle.client else None,
                source_cycle_id=cycle.id,
                service_name=cycle.service.name if cycle.service else None,
                ends_on=cycle.ends_on,
                display_status=status,
                portal_requested=portal_requested,
                next_contact_date=case.next_contact_date if case else None,
                resolution_reason=case.resolution_reason if case else None,
                resolution_note=case.resolution_note if case else None,
                resolved_at=case.resolved_at if case else None,
                successor_cycle_id=case.successor_cycle_id if case else None,
            )
        )

    order = {
        "overdue": 0,
        "awaiting_client": 1,
        "requested": 2,
        "pending": 3,
        "upcoming": 4,
        "renewed": 5,
        "ended_without_renewal": 6,
    }
    views.sort(key=lambda v: (order.get(v.display_status, 9), not v.portal_requested, v.ends_on))
    return views


def _get_or_create_case(db: Session, *, organization_id: uuid.UUID, cycle: Cycle) -> RenewalCase:
    case = db.scalar(
        select(RenewalCase).where(
            RenewalCase.organization_id == organization_id,
            RenewalCase.source_cycle_id == cycle.id,
        )
    )
    if case is not None:
        return case
    case = RenewalCase(
        organization_id=organization_id,
        client_id=cycle.client_id,
        source_cycle_id=cycle.id,
        status="open",
    )
    db.add(case)
    return case


def _get_cycle(db: Session, *, organization_id: uuid.UUID, cycle_id: uuid.UUID) -> Cycle:
    cycle = db.scalar(
        select(Cycle).where(Cycle.organization_id == organization_id, Cycle.id == cycle_id)
    )
    if cycle is None:
        raise AuthError("not_found", "Ciclo não encontrado.", 404)
    return cycle


def mark_awaiting_client(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
    next_contact_date: date,
) -> RenewalCase:
    cycle = _get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    if cycle.status == "cancelled":
        raise AuthError(
            "cycle_cancelled", "Um ciclo cancelado não tem processo de renovação.", 422
        )
    case = _get_or_create_case(db, organization_id=organization_id, cycle=cycle)
    if case.status in TERMINAL_CASE_STATUSES:
        raise AuthError(
            "renewal_case_closed",
            "Este processo de renovação já foi concluído.",
            409,
        )
    case.status = "awaiting_client"
    case.next_contact_date = next_contact_date
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def end_without_renewal(
    db: Session,
    *,
    organization_id: uuid.UUID,
    cycle_id: uuid.UUID,
    resolution_reason: str,
    resolution_note: str | None,
) -> RenewalCase:
    cycle = _get_cycle(db, organization_id=organization_id, cycle_id=cycle_id)
    if cycle.status == "cancelled":
        raise AuthError(
            "cycle_cancelled", "Um ciclo cancelado não tem processo de renovação.", 422
        )
    case = _get_or_create_case(db, organization_id=organization_id, cycle=cycle)
    if case.status in TERMINAL_CASE_STATUSES:
        raise AuthError(
            "renewal_case_closed",
            "Este processo de renovação já foi concluído.",
            409,
        )
    case.status = "ended_without_renewal"
    case.resolution_reason = resolution_reason
    case.resolution_note = resolution_note
    case.resolved_at = datetime.now(UTC)
    case.next_contact_date = None
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def mark_renewed(
    db: Session,
    *,
    organization_id: uuid.UUID,
    source_cycle_id: uuid.UUID,
    successor_cycle_id: uuid.UUID,
) -> RenewalCase:
    """Called from cycle creation once a new cycle is confirmed as the
    renewal of `source_cycle_id`. Idempotent: replaying with the same
    successor is a no-op; a different successor is never allowed to
    overwrite an already-resolved case (the DB's unique index on
    `successor_cycle_id` backs this up too)."""
    cycle = _get_cycle(db, organization_id=organization_id, cycle_id=source_cycle_id)
    case = _get_or_create_case(db, organization_id=organization_id, cycle=cycle)
    if case.status == "renewed" and case.successor_cycle_id == successor_cycle_id:
        return case
    if case.status in TERMINAL_CASE_STATUSES:
        raise AuthError(
            "renewal_case_closed",
            "Este processo de renovação já foi concluído.",
            409,
        )
    case.status = "renewed"
    case.successor_cycle_id = successor_cycle_id
    case.resolved_at = datetime.now(UTC)
    case.next_contact_date = None
    db.add(case)
    db.flush()
    return case
