"""Real usage counters for the service catalog — read-only aggregate.

Answers "how many client contracts actually reference this service", so the
Serviços screen can show a trustworthy number instead of a guess. Nothing is
persisted and no new column exists: both counters are recomputed per request
from `cycles` alone.

Definitions kept deliberately narrow so the number never overstates reality:
- `running_cycles`: cycles that are BOTH `status == "active"` AND currently
  inside their own `[starts_on, ends_on)` window. A row left at "active" past
  its `ends_on` is elapsed, not running (the app treats it as ended-by-date
  everywhere else — see `cycle_period.is_current` / `domain._cycle_out`), so it
  is deliberately excluded here too.
- `total_cycles` / `distinct_clients`: every non-cancelled cycle ever created
  for the service. `cancelled` is the app's logical delete
  (`domain.cancel_cycle`), so counting it would inflate a catalogue metric with
  erased contracts.

Archived services are still counted: history does not disappear because the
professional stopped selling something.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.models.cycle import Cycle


@dataclass
class ServiceUsage:
    service_id: uuid.UUID
    running_cycles: int
    total_cycles: int
    distinct_clients: int


def service_usage(
    db: Session, *, organization_id: uuid.UUID, today: date
) -> dict[uuid.UUID, ServiceUsage]:
    """Usage per service_id. Services with no cycle at all are simply absent
    from the mapping — the caller renders zero for them."""
    totals = db.execute(
        select(
            Cycle.service_id,
            func.count(Cycle.id),
            func.count(distinct(Cycle.client_id)),
        )
        .where(
            Cycle.organization_id == organization_id,
            Cycle.status != "cancelled",
        )
        .group_by(Cycle.service_id)
    ).all()

    running = dict(
        db.execute(
            select(Cycle.service_id, func.count(Cycle.id))
            .where(
                Cycle.organization_id == organization_id,
                Cycle.status == "active",
                Cycle.starts_on <= today,
                Cycle.ends_on > today,
            )
            .group_by(Cycle.service_id)
        ).all()
    )

    return {
        service_id: ServiceUsage(
            service_id=service_id,
            running_cycles=int(running.get(service_id, 0)),
            total_cycles=int(total),
            distinct_clients=int(clients),
        )
        for service_id, total, clients in totals
    }
