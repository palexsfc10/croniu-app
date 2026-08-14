"""Prevent duplicate and overlapping cycles for the same client+service."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.cycle import Cycle
from app.services.auth import AuthError

OPERATIONAL_STATUSES = frozenset({"active", "paused"})


def _lock_query(db: Session, query):
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        return query.with_for_update()
    return query


def assert_no_duplicate_or_overlap(
    db: Session,
    *,
    organization_id: uuid.UUID,
    client_id: uuid.UUID,
    service_id: uuid.UUID,
    starts_on: date,
    ends_on: date,
    lesson_count: int | None = None,
    exclude_cycle_id: uuid.UUID | None = None,
) -> None:
    """Block identical or overlapping operational cycles (same tenant/client/service).

    Different services may run in parallel. Sequential periods (new.starts_on >=
    existing.ends_on) are allowed. Cancelled/ended/completed do not block.
    ends_on is treated as exclusive renewal date (half-open interval).
    """
    lock_client = select(Client).where(
        Client.id == client_id,
        Client.organization_id == organization_id,
    )
    if db.scalar(_lock_query(db, lock_client)) is None:
        raise AuthError("not_found", "Cliente não encontrado.", 404)

    query = select(Cycle).where(
        Cycle.organization_id == organization_id,
        Cycle.client_id == client_id,
        Cycle.service_id == service_id,
        Cycle.status.in_(OPERATIONAL_STATUSES),
    )
    if exclude_cycle_id is not None:
        query = query.where(Cycle.id != exclude_cycle_id)
    rows = list(db.scalars(_lock_query(db, query)).all())
    for row in rows:
        identical = (
            row.starts_on == starts_on
            and row.ends_on == ends_on
            and (lesson_count is None or row.lesson_count == lesson_count)
        )
        if identical:
            raise AuthError(
                "DUPLICATE_CYCLE",
                "Já existe um ciclo igual para este cliente neste período.",
                409,
                details={"existing_cycle_id": str(row.id)},
            )
        overlaps = row.starts_on < ends_on and starts_on < row.ends_on
        if overlaps:
            raise AuthError(
                "OVERLAPPING_CYCLE",
                "Este cliente já possui um ciclo desse serviço que coincide com o período selecionado.",
                409,
                details={"existing_cycle_id": str(row.id)},
            )
