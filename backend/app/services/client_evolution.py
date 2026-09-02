"""Acompanhamentos (client-evolution check-ins): "clientes que precisam de
acompanhamento" derived from real, already-existing data — never a
persisted/invented signal. A client counts as pending when they have an
active cycle (real accompaniment in progress) and either never had a
non-archived evaluation, or their most recent one is older than
`days_threshold`.

Naming note: `app/services/accompaniment.py` already exists and implements
a *different* concept — the client-onboarding "Preparar acompanhamento"
readiness checklist (`ClientJourney.accompaniment_checklist`). This module
is deliberately named differently to avoid colliding with that file; the
product-facing "Acompanhamentos" screen (evolution/check-in records,
backed by `ClientEvaluation`) has no prior backend module of its own.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client
from app.models.cycle import Cycle
from app.services import agenda as agenda_svc
from app.services import evaluations as eval_svc

DEFAULT_DAYS_THRESHOLD = 15
MAX_RESULTS = 200


def list_pending(
    db: Session,
    *,
    organization_id: uuid.UUID,
    days_threshold: int = DEFAULT_DAYS_THRESHOLD,
    limit: int = MAX_RESULTS,
) -> list[dict[str, Any]]:
    days_threshold = max(0, days_threshold)
    limit = max(1, min(limit, MAX_RESULTS))

    clients = list(
        db.scalars(
            select(Client).where(
                Client.organization_id == organization_id,
                Client.status == "active",
            )
        ).all()
    )
    if not clients:
        return []
    client_ids = [c.id for c in clients]

    active_cycles = list(
        db.scalars(
            select(Cycle)
            .where(
                Cycle.organization_id == organization_id,
                Cycle.client_id.in_(client_ids),
                Cycle.status == "active",
            )
            .options(selectinload(Cycle.service))
        ).all()
    )
    active_cycle_by_client: dict[uuid.UUID, Cycle] = {c.client_id: c for c in active_cycles}

    latest_eval = eval_svc.latest_by_client(db, organization_id=organization_id)
    next_appt = agenda_svc.next_appointment_by_client(
        db, organization_id=organization_id, client_ids=client_ids
    )

    today = datetime.now(UTC).date()
    rows: list[dict[str, Any]] = []
    for client in clients:
        # "Precisa de acompanhamento" só se aplica a quem está em
        # acompanhamento ativo de fato (ciclo ativo real) — um cliente sem
        # ciclo já é sinalizado por outro motivo (onboarding/sem
        # acompanhamento) na lista de Clientes, não aqui.
        cycle = active_cycle_by_client.get(client.id)
        if cycle is None:
            continue
        last = latest_eval.get(client.id)
        last_at = (last.published_at or last.created_at) if last else None
        days_since = (today - last_at.date()).days if last_at else None
        if last is not None and days_since is not None and days_since < days_threshold:
            continue
        appt = next_appt.get(client.id)
        rows.append(
            {
                "client_id": str(client.id),
                "client_name": client.full_name,
                "cycle_id": str(cycle.id),
                "service_name": cycle.service.name if cycle.service else None,
                "last_evaluation_at": last_at.isoformat() if last_at else None,
                "days_since_last_evaluation": days_since,
                "next_appointment_at": appt.starts_at.isoformat() if appt else None,
            }
        )

    rows.sort(
        key=lambda r: (
            0 if r["days_since_last_evaluation"] is None else 1,
            -(r["days_since_last_evaluation"] or 0),
        )
    )
    return rows[:limit]
