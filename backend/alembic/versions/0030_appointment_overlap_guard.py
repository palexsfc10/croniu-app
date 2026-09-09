"""Prevent overlapping appointments for the same organization at the
database level.

The application already checks for conflicts before inserting
(`agenda_svc.find_conflicts`), but that check-then-insert has no protection
against two concurrent requests both passing the check for the same free
slot and then both inserting — reproduced directly: two threads booking the
identical slot both succeed today. A GiST exclusion constraint makes the
database itself the source of truth, closing the race regardless of which
code path writes the row (manual booking, smart availability, cycle/agenda
generation, reschedule).

Cancelled appointments are excluded (`WHERE status <> 'cancelled'`) — a
cancelled slot must remain bookable. The overlap uses the same half-open
range `[starts_at, ends_at)` as the existing
`ck_appointments_ends_after_starts` check and `find_conflicts`' own
`starts_at < :ends_at AND ends_at > :starts_at` comparison, so two merely
back-to-back appointments (one's `ends_at` equal to the other's
`starts_at`) do NOT overlap and remain allowed.

Requires the `btree_gist` extension (needed to use the `=` operator class
for `organization_id` alongside the range `&&` operator in one GiST index)
— installed here idempotently.

Safety: before touching the schema, this migration runs an explicit
read-only check for any EXISTING pair of non-cancelled appointments in the
same organization that already overlap, and raises a clear, actionable
error naming the exact rows if it finds any — never silently cancels,
edits, or deletes data to make room for the constraint. The `ALTER TABLE
... ADD CONSTRAINT ... EXCLUDE` statement itself is also a real safety net
independent of that pre-check: PostgreSQL validates every existing row
against a new exclusion constraint as part of adding it (no `NOT VALID`
here), so even a bug in the pre-check's own query could not let a
conflicting dataset through — the ALTER TABLE would still fail with
`23P01 exclusion_violation` and the whole migration aborts transactionally.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0030_appointment_overlap_guard"
down_revision: str | None = "0029_renewal_cases"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREFLIGHT_SQL = """
    SELECT a.id, a.organization_id, a.starts_at, a.ends_at,
           b.id, b.starts_at, b.ends_at
    FROM appointments a
    JOIN appointments b
        ON a.organization_id = b.organization_id
       AND a.id < b.id
       AND a.status <> 'cancelled'
       AND b.status <> 'cancelled'
       AND tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(b.starts_at, b.ends_at, '[)')
    LIMIT 10
"""


def upgrade() -> None:
    conn = op.get_bind()
    existing_overlaps = conn.exec_driver_sql(_PREFLIGHT_SQL).fetchall()
    if existing_overlaps:
        rows = "\n".join(
            f"  - appointment {a_id} ({a_start}..{a_end}) overlaps "
            f"{b_id} ({b_start}..{b_end}) in org {org_id}"
            for a_id, org_id, a_start, a_end, b_id, b_start, b_end in existing_overlaps
        )
        raise RuntimeError(
            "Refusing to add ck_appointments_no_overlap: existing non-cancelled "
            "appointments already overlap. This migration never edits/cancels "
            "data automatically — resolve these manually first "
            f"(showing up to 10):\n{rows}"
        )

    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(
        """
        ALTER TABLE appointments
        ADD CONSTRAINT ck_appointments_no_overlap
        EXCLUDE USING gist (
            organization_id WITH =,
            tstzrange(starts_at, ends_at, '[)') WITH &&
        ) WHERE (status <> 'cancelled')
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE appointments DROP CONSTRAINT ck_appointments_no_overlap")
