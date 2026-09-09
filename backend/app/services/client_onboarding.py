"""Onboarding board — real entry/evolution state of each client, read-only.

Groups clients by the real `ClientJourney.stage` (and the separate
`requires_professional_attention` flag), never a fabricated "continuous
accompaniment" concept. A client with no `ClientJourney` row yet has never
had it lazily created (see `journey.ensure_legacy_active_journey`, only
triggered by opening the client's own page) — that is operationally
equivalent to `active` (nothing pending), so it is grouped as `completed`
here without writing a row.

`days_since_update` is `ClientJourney.updated_at` (or `Client.created_at`
when there is no journey yet) — an honest proxy for "time in this state",
not a dedicated `stage_changed_at` the schema doesn't have; it moves on any
journey field edit, not only a stage change.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.client_evaluation import ClientEvaluation
from app.models.intake import ClientIntakeSubmission, ClientJourney
from app.services import status_labels

COMPLETED_LIMIT = 20
DRAFT_EVALUATIONS_LIMIT = 20


@dataclass
class DraftEvaluationItem:
    evaluation_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    title: str
    updated_at: datetime


@dataclass
class BoardItem:
    client_id: uuid.UUID
    client_name: str
    entry_type: str
    stage: str
    stage_label: str
    requires_professional_attention: bool
    attention_note: str | None
    days_since_update: int | None
    next_action: str | None
    next_action_label: str | None
    submission_id: uuid.UUID | None
    submission_status: str | None


def _group_for(stage: str, attention: bool) -> str | None:
    if attention:
        return "attention"
    if stage in {"rejected", "archived"}:
        return None
    if stage == "pending_registration":
        return "invite_pending"
    if stage in {"pending_anamnesis", "pending_review"}:
        return "in_progress"
    return "completed"


def onboarding_board(
    db: Session, *, organization_id: uuid.UUID
) -> dict[str, list[BoardItem]]:
    clients = list(
        db.scalars(
            select(Client).where(
                Client.organization_id == organization_id, Client.status == "active"
            )
        ).all()
    )
    client_ids = [c.id for c in clients]
    if not client_ids:
        return {"attention": [], "invite_pending": [], "in_progress": [], "completed": []}

    journeys = {
        j.client_id: j
        for j in db.scalars(
            select(ClientJourney).where(
                ClientJourney.organization_id == organization_id,
                ClientJourney.client_id.in_(client_ids),
            )
        ).all()
    }

    # Most recent non-approved/rejected submission per client — used both to
    # tell "manual" vs "convite" entry and to link the pending review.
    submissions = list(
        db.scalars(
            select(ClientIntakeSubmission)
            .where(
                ClientIntakeSubmission.organization_id == organization_id,
                ClientIntakeSubmission.client_id.in_(client_ids),
            )
            .order_by(ClientIntakeSubmission.created_at.desc())
        ).all()
    )
    latest_submission_by_client: dict[uuid.UUID, ClientIntakeSubmission] = {}
    any_submission_by_client: set[uuid.UUID] = set()
    for sub in submissions:
        if sub.client_id is None:
            continue
        any_submission_by_client.add(sub.client_id)
        if sub.client_id not in latest_submission_by_client:
            latest_submission_by_client[sub.client_id] = sub

    now = datetime.now(UTC)
    groups: dict[str, list[BoardItem]] = {
        "attention": [],
        "invite_pending": [],
        "in_progress": [],
        "completed": [],
    }

    for client in clients:
        journey = journeys.get(client.id)
        stage = journey.stage if journey else "active"
        attention = bool(journey.requires_professional_attention) if journey else False
        group = _group_for(stage, attention)
        if group is None:
            continue

        updated_at = journey.updated_at if journey else client.created_at
        days = (now - updated_at).days if updated_at else None
        submission = latest_submission_by_client.get(client.id)

        groups[group].append(
            BoardItem(
                client_id=client.id,
                client_name=client.full_name,
                entry_type="convite" if client.id in any_submission_by_client else "manual",
                stage=stage,
                stage_label=status_labels.journey_stage_label(stage),
                requires_professional_attention=attention,
                attention_note=journey.attention_note if journey else None,
                days_since_update=days,
                next_action=journey.next_action if journey else None,
                next_action_label=status_labels.next_action_label(
                    journey.next_action if journey else None
                ),
                submission_id=submission.id if submission else None,
                submission_status=submission.status if submission else None,
            )
        )

    for key in ("attention", "invite_pending", "in_progress"):
        groups[key].sort(key=lambda it: it.days_since_update or 0, reverse=True)
    groups["completed"].sort(key=lambda it: it.days_since_update or 0)
    groups["completed"] = groups["completed"][:COMPLETED_LIMIT]

    return groups


def list_draft_evaluations(
    db: Session, *, organization_id: uuid.UUID, limit: int = DRAFT_EVALUATIONS_LIMIT
) -> list[DraftEvaluationItem]:
    """Real draft evaluations org-wide, most recently edited first — never
    shown on the client portal (drafts are internal-only, same rule as
    everywhere else in the app). Used by the onboarding board's mobile
    digest ("avaliações em rascunho")."""
    limit = max(1, min(limit, 100))
    rows = list(
        db.scalars(
            select(ClientEvaluation)
            .where(
                ClientEvaluation.organization_id == organization_id,
                ClientEvaluation.status == "draft",
            )
            .order_by(ClientEvaluation.updated_at.desc())
            .limit(limit)
        ).all()
    )
    if not rows:
        return []
    client_ids = {row.client_id for row in rows}
    names = {
        c.id: c.full_name
        for c in db.scalars(
            select(Client).where(Client.organization_id == organization_id, Client.id.in_(client_ids))
        ).all()
    }
    return [
        DraftEvaluationItem(
            evaluation_id=row.id,
            client_id=row.client_id,
            client_name=names.get(row.client_id, "Cliente"),
            title=row.title,
            updated_at=row.updated_at,
        )
        for row in rows
        if row.client_id in names
    ]
