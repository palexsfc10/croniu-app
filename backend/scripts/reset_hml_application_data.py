"""Idempotent HML application-data wipe. Never drop schema, alembic, or billing catalog.

Abort unless CRONIU_ENV=hml, database name matches HML, and RESET_HML_CONFIRM=croniu-hml.
Preserves: alembic_version, billing_plans, billing_prices, system anamnesis templates
(org_id IS NULL), platform admin users + platform_memberships.
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime

from sqlalchemy import create_engine, text

PRESERVE_TABLES = frozenset(
    {
        "alembic_version",
        "billing_plans",
        "billing_prices",
    }
)

# Truncated in FK-safe order groups via CASCADE from organizations + leftover users.
TENANT_TRUNCATE = [
    "billing_webhook_events",
    "billing_checkouts",
    "subscriptions",
    "agent_audit_logs",
    "agent_pending_actions",
    "agent_tool_calls",
    "agent_runs",
    "agent_messages",
    "agent_threads",
    "agent_usage_daily",
    "client_evaluation_criteria",
    "client_evaluations",
    "payment_proofs",
    "payment_reports",
    "renewal_requests",
    "organization_payment_settings",
    "client_public_accesses",
    "appointments",
    "locations",
    "password_reset_tokens",
    "email_verification_tokens",
    "receivables",
    "cycles",
    "cycle_templates",
    "services",
    "clients",
    "operational_occurrences",
    "recurring_client_tasks",
    "protocol_versions",
    "protocols",
    "consent_records",
    "client_anamnesis_responses",
    "client_intake_submissions",
    "client_journeys",
    "organization_intake_links",
    "user_feedbacks",
    "sessions",
    "memberships",
    "platform_sessions",
    "admin_audit_logs",
]


def _abort(msg: str) -> None:
    print(f"ABORT: {msg}", file=sys.stderr)
    sys.exit(2)


def _guard_environment() -> str:
    env = (os.environ.get("CRONIU_ENV") or "").strip().lower()
    confirm = (os.environ.get("RESET_HML_CONFIRM") or "").strip()
    url = os.environ.get("DATABASE_URL") or ""
    if env != "hml":
        _abort(f"CRONIU_ENV must be hml, got {env!r}")
    if confirm != "croniu-hml":
        _abort("RESET_HML_CONFIRM must be exactly croniu-hml")
    if "prd" in url.lower() or "prod" in url.lower():
        _abort("DATABASE_URL looks like production")
    if "hml" not in url.lower() and "croniu" not in url.lower():
        _abort("DATABASE_URL does not look like HML")
    return url


def main() -> None:
    url = _guard_environment()
    engine = create_engine(url)
    stamp = datetime.now(UTC).isoformat()
    print(f"reset_hml_application_data start {stamp}")

    with engine.begin() as conn:
        dbname = conn.execute(text("SELECT current_database()")).scalar()
        host = conn.execute(text("SELECT inet_server_addr()")).scalar()
        alembic = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        print(f"database={dbname} host={host} alembic={alembic}")
        if dbname in {None, "postgres"}:
            _abort("unexpected database name")
        if "prd" in str(dbname).lower() or "prod" in str(dbname).lower():
            _abort("database name looks like production")

        before = {}
        tables = conn.execute(
            text(
                "SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY 1"
            )
        ).scalars()
        for name in tables:
            before[name] = conn.execute(text(f'SELECT count(*) FROM "{name}"')).scalar()
        print("counts_before", before)

        existing = set(before)
        to_truncate = [t for t in TENANT_TRUNCATE if t in existing]
        print("truncate_targets", to_truncate)

        if to_truncate:
            quoted = ", ".join(f'"{t}"' for t in to_truncate)
            conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))

        if "organizations" in existing:
            conn.execute(text("DELETE FROM organizations"))

        if "anamnesis_template_versions" in existing and "anamnesis_templates" in existing:
            conn.execute(
                text(
                    """
                    DELETE FROM anamnesis_template_versions
                    WHERE template_id IN (
                      SELECT id FROM anamnesis_templates
                      WHERE organization_id IS NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text("DELETE FROM anamnesis_templates WHERE organization_id IS NOT NULL")
            )

        if "users" in existing:
            conn.execute(
                text(
                    """
                    DELETE FROM users
                    WHERE id NOT IN (SELECT user_id FROM platform_memberships)
                    """
                )
            )

        after = {}
        for name in before:
            after[name] = conn.execute(text(f'SELECT count(*) FROM "{name}"')).scalar()
        print("counts_after", after)

        alembic_after = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if alembic_after != alembic:
            raise RuntimeError("alembic_version changed during reset")
        for preserved in PRESERVE_TABLES:
            if preserved in before and after.get(preserved) != before[preserved]:
                raise RuntimeError(f"preserved table changed: {preserved}")

        zero_required = [
            "organizations",
            "clients",
            "cycles",
            "appointments",
            "receivables",
            "client_intake_submissions",
            "agent_threads",
            "sessions",
        ]
        for name in zero_required:
            if after.get(name, 0) not in (0, None):
                raise RuntimeError(f"{name} not empty after reset: {after[name]}")

        print(f"alembic_preserved={alembic_after}")
        print("reset_hml_application_data ok")


if __name__ == "__main__":
    main()
