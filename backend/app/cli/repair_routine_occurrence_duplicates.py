"""CLI: repair duplicate routine occurrences created before the dedup fix.

See docs/sprints/DIAGNOSIS_ROUTINES_DUPLICATION.md for the root causes this
data reflects. This script never deletes anything and never touches
completed/dismissed history. For each (organization, routine, target) group
that has more than one "open" or "deferred" occurrence open at the same
time, it keeps exactly one canonical row and cancels the rest — auditable
(status="cancelled", reason recorded), reversible in the sense that nothing
is destroyed, and idempotent (running it again finds nothing left to do).

Canonical selection, in order:
  1. The row whose due_on matches the routine's current next_run_on (the
     field the rest of the app already treats as authoritative).
  2. Otherwise, the row with the earliest due_on (the oldest, and therefore
     most representative, obligation), tie-broken by earliest created_at.

Groups where the routine definition no longer exists are skipped and
reported — this script never guesses when it cannot safely decide.

Usage:
    python -m app.cli.repair_routine_occurrence_duplicates [--organization-id ID] [--apply]

Without --apply this only reports what would change (dry run, default).
"""

from __future__ import annotations

import argparse
import sys
import uuid
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.intake import OperationalOccurrence, RecurringClientTask

ACTIVE_STATUSES = {"open", "deferred"}


def _target_key(row: OperationalOccurrence) -> tuple[str, str, str, str]:
    meta = row.meta if isinstance(row.meta, dict) else {}
    routine_id = str(meta.get("routine_id") or "")
    client_id = str(row.client_id) if row.client_id else ""
    cycle_id = str(row.cycle_id) if row.cycle_id else ""
    return (str(row.organization_id), routine_id, client_id, cycle_id)


def _pick_canonical(
    rows: list[OperationalOccurrence], routine: RecurringClientTask | None
) -> OperationalOccurrence:
    if routine is not None and routine.next_run_on is not None:
        for row in rows:
            if row.due_on == routine.next_run_on:
                return row
    return min(rows, key=lambda r: (r.due_on, r.created_at))


def repair(
    db: Session, *, organization_id: uuid.UUID | None, apply: bool
) -> dict[str, object]:
    q = select(OperationalOccurrence).where(
        OperationalOccurrence.source == "routine",
        OperationalOccurrence.status.in_(ACTIVE_STATUSES),
    )
    if organization_id is not None:
        q = q.where(OperationalOccurrence.organization_id == organization_id)
    rows = list(db.scalars(q).all())

    groups: dict[tuple[str, str, str, str], list[OperationalOccurrence]] = defaultdict(list)
    for row in rows:
        groups[_target_key(row)].append(row)

    routine_cache: dict[str, RecurringClientTask | None] = {}

    def routine_for(routine_id: str) -> RecurringClientTask | None:
        if routine_id not in routine_cache:
            routine_cache[routine_id] = (
                db.get(RecurringClientTask, uuid.UUID(routine_id)) if routine_id else None
            )
        return routine_cache[routine_id]

    by_org: dict[str, dict[str, int]] = defaultdict(
        lambda: {"open_before": 0, "duplicate_groups": 0, "cancelled": 0, "skipped_groups": 0}
    )
    now = datetime.now(UTC)
    reason = f"duplicate_repair:{now.date().isoformat()}"
    cancelled_ids: list[str] = []

    for (org_id, routine_id, _client_id, _cycle_id), group_rows in groups.items():
        stats = by_org[org_id]
        stats["open_before"] += len(group_rows)
        if len(group_rows) < 2:
            continue
        stats["duplicate_groups"] += 1
        if not routine_id:
            stats["skipped_groups"] += 1
            continue
        routine = routine_for(routine_id)
        if routine is None:
            stats["skipped_groups"] += 1
            continue
        canonical = _pick_canonical(group_rows, routine)
        for row in group_rows:
            if row.id == canonical.id:
                continue
            if apply:
                row.status = "cancelled"
                row.reason = reason
                db.add(row)
            cancelled_ids.append(str(row.id))
            stats["cancelled"] += 1

    if apply:
        db.commit()
    else:
        db.rollback()

    return {
        "apply": apply,
        "organizations": dict(by_org),
        "cancelled_count": len(cancelled_ids),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Repara ocorrências de rotina duplicadas (cancela excedentes, preserva histórico)."
    )
    parser.add_argument(
        "--organization-id",
        default=None,
        help="Restringe a uma organização (UUID). Sem isso, roda em todas.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica o cancelamento. Sem esta flag, apenas relata (dry run).",
    )
    args = parser.parse_args(argv)

    org_id = uuid.UUID(args.organization_id) if args.organization_id else None
    db = SessionLocal()
    try:
        result = repair(db, organization_id=org_id, apply=args.apply)
    finally:
        db.close()

    mode = "APLICADO" if result["apply"] else "DRY RUN (nada foi alterado)"
    print(f"Modo: {mode}")
    print(f"Total de ocorrências que seriam/foram canceladas: {result['cancelled_count']}")
    for org_id_str, stats in sorted(result["organizations"].items()):
        if stats["duplicate_groups"] == 0:
            continue
        print(
            f"  org={org_id_str} open_antes={stats['open_before']} "
            f"grupos_duplicados={stats['duplicate_groups']} "
            f"cancelados={stats['cancelled']} grupos_pulados={stats['skipped_groups']}"
        )
    if not result["apply"] and result["cancelled_count"]:
        print("Rode novamente com --apply para efetivar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
