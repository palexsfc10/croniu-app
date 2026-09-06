"""Gate correction (2026-09-02): Croniu distinguishes Acompanhamento
(registro contínuo de evolução/contato/percepção) from Avaliação (medição
estruturada e periódica) — they are NOT the same concept. An inspection
confirmed there is no dedicated, repeated, timestamped accompaniment log
anywhere in the backend: `Client.notes` is a single overwritten field (no
history), `Cycle.last_contacted_at`/`contact_confirmed_at` are
renewal-specific, and `ClientJourney` has no repeated log. `ClientEvaluation`
(avaliação) is the only real, dated, per-client registration mechanism that
exists today. So `list_pending()` below is honestly an **avaliação-pendente**
signal (active cycle + no recent/no evaluation), never presented as a
generic "acompanhamento" pendency the product doesn't actually track yet —
see the frontend's `/app/accompaniment` page, whose "Pendentes" tab is
labeled "Avaliações pendentes" for the same reason. Function/route/tool
names were kept stable (already-delivered contract) — only the honesty of
labels/descriptions changed.

Naming note: `app/services/accompaniment.py` already exists and implements
a *different* concept — the client-onboarding "Preparar acompanhamento"
readiness checklist (`ClientJourney.accompaniment_checklist`). This module
is deliberately named differently to avoid colliding with that file.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client
from app.models.cycle import Cycle
from app.models.organization import Organization
from app.services import agenda as agenda_svc
from app.services import cycle_period
from app.services import evaluations as eval_svc
from app.services.pendencies import org_local_date, org_today

DEFAULT_DAYS_THRESHOLD = 15
MAX_RESULTS = 200


def list_pending(
    db: Session,
    *,
    organization_id: uuid.UUID,
    days_threshold: int = DEFAULT_DAYS_THRESHOLD,
    limit: int = MAX_RESULTS,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    days_threshold = max(0, days_threshold)
    limit = max(1, min(limit, MAX_RESULTS))

    org = db.get(Organization, organization_id)
    tz_name = org.timezone if org else None
    today = org_today(tz_name, now=now)

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

    # Every cycle with a compatible status is fetched in one bulk query
    # (no N+1); vigency (starts_on <= today < ends_on, the same exclusive
    # contract as cycle_period.is_current — never `pick_operational_cycle`,
    # which falls back to the next upcoming cycle in other contexts where
    # that fallback is wanted, but not here: a future cycle must never
    # generate a pendency) is applied in Python per row, and ALL of a
    # client's currently-vigent cycles are kept — never collapsed into a
    # single "last one wins" dict before eligibility is decided, or a
    # second, recently-started cycle for another service could silently
    # erase a pendency legitimately owed by an older, still-vigent one.
    all_cycles = list(
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
    current_cycles_by_client: dict[uuid.UUID, list[Cycle]] = {}
    for c in all_cycles:
        if cycle_period.is_current(starts_on=c.starts_on, ends_on=c.ends_on, today=today):
            current_cycles_by_client.setdefault(c.client_id, []).append(c)

    latest_eval = eval_svc.latest_by_client(db, organization_id=organization_id)
    next_appt = agenda_svc.next_appointment_by_client(
        db, organization_id=organization_id, client_ids=client_ids
    )

    rows: list[dict[str, Any]] = []
    for client in clients:
        # "Precisa de acompanhamento" só se aplica a quem está em
        # acompanhamento ativo de fato (ciclo vigente real) — um cliente
        # sem ciclo vigente já é sinalizado por outro motivo (onboarding/
        # sem acompanhamento) na lista de Clientes, não aqui. Um ciclo
        # persistido como "active" mas já encerrado ou ainda futuro não
        # conta como vigente.
        cycles = current_cycles_by_client.get(client.id)
        if not cycles:
            continue
        last = latest_eval.get(client.id)
        last_at = (last.published_at or last.created_at) if last else None
        if last_at is not None:
            days_since = (today - org_local_date(last_at, tz_name)).days
            if days_since < days_threshold:
                continue
            # Eligibility doesn't depend on which cycle here — any vigent
            # cycle qualifies once the evaluation itself is old enough.
            # Deterministic representative for display purposes only.
            cycle = min(cycles, key=lambda c: (c.starts_on, str(c.id)))
        else:
            # Avaliação é acompanhamento de evolução, não requisito
            # instantâneo do cadastro: sem nenhum registro ainda, a
            # pendência só nasce depois do MESMO limiar acima, contado a
            # partir do início de CADA ciclo vigente — ou da criação do
            # cliente, se for posterior. Um cliente com dois ciclos
            # vigentes (ex.: dois serviços) já é elegível se QUALQUER um
            # deles já passou do limiar — o ciclo recém-iniciado do outro
            # serviço nunca apaga essa pendência.
            eligible = [
                (c, max(c.starts_on, org_local_date(client.created_at, tz_name)))
                for c in cycles
            ]
            eligible = [(c, a) for c, a in eligible if (today - a).days >= days_threshold]
            if not eligible:
                continue
            # Most overdue (earliest anchor) is the representative shown.
            cycle, _anchor = min(eligible, key=lambda pair: (pair[1], str(pair[0].id)))
            # `days_since_last_evaluation` continua None na saída: não há
            # "avaliação há N dias" para mostrar quando nunca houve uma.
            days_since = None
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
