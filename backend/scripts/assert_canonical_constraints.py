"""Inspect Postgres for canonical CHECK/UNIQUE names after alembic upgrade."""

from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, text

EXPECTED = {
    "ck_agent_messages_message_type",
    "ck_agent_messages_role",
    "ck_agent_pending_actions_risk_class",
    "ck_agent_pending_actions_status",
    "ck_agent_threads_status",
    "ck_agent_tool_calls_risk_class",
    "ck_appointments_ends_after_starts",
    "ck_client_intake_submissions_status",
    "ck_organization_intake_links_status",
    "ck_org_payment_pix_key_type",
    "ck_payment_proofs_mime",
    "ck_payment_proofs_size",
    "ck_payment_reports_amount",
    "ck_payment_reports_status",
    "ck_protocols_status",
    "ck_renewal_requests_status",
    "ck_user_feedbacks_category",
    "ck_user_feedbacks_status",
    "ck_cycle_templates_status",
    "ck_client_evaluations_status",
    "uq_op_occ_org_idem",
}


def main() -> int:
    url = os.environ["DATABASE_URL"]
    engine = create_engine(url)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE connamespace = 'public'::regnamespace"
            )
        ).scalars().all()
    missing = EXPECTED - set(rows)
    if missing:
        print("missing_constraints", sorted(missing), file=sys.stderr)
        return 1
    print("canonical_constraints_ok", len(EXPECTED))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
