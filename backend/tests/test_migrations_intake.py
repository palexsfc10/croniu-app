"""Migration chain regressions for client intake (0019)."""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

BACKEND = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND / "alembic.ini"


def _db_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://croniu:croniu_dev_password_change_me@localhost:5433/croniu_test",
    )


def _alembic_env() -> dict[str, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = _db_url()
    env["PYTHONPATH"] = str(BACKEND)
    return env


def _run_alembic(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["alembic", "-c", str(ALEMBIC_INI), *args],
        cwd=str(BACKEND),
        env=_alembic_env(),
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture()
def migration_db():
    """Dedicated disposable database for empty/0018→head paths."""
    base = _db_url()
    # Use a unique DB name so parallel pytest / app tests stay untouched.
    name = f"croniu_mig_{uuid.uuid4().hex[:10]}"
    admin_url = base.rsplit("/", 1)[0] + "/postgres"
    target_url = base.rsplit("/", 1)[0] + f"/{name}"

    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()

    os.environ["DATABASE_URL"] = target_url
    try:
        yield target_url
    finally:
        # Drop with force disconnect
        admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin.connect() as conn:
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :n AND pid <> pg_backend_pid()"
                ),
                {"n": name},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        admin.dispose()
        os.environ["DATABASE_URL"] = base


def test_empty_database_upgrade_head_unique(migration_db: str):
    os.environ["DATABASE_URL"] = migration_db
    up = _run_alembic("upgrade", "head")
    assert up.returncode == 0, up.stdout + up.stderr
    heads = _run_alembic("heads")
    assert heads.returncode == 0, heads.stderr
    lines = [ln for ln in heads.stdout.strip().splitlines() if ln.strip()]
    assert len(lines) == 1
    assert "0020_prof_accomp_ux" in lines[0]

    current = _run_alembic("current")
    assert "0020_prof_accomp_ux" in current.stdout

    engine = create_engine(migration_db)
    insp = inspect(engine)
    for table in (
        "organization_intake_links",
        "client_journeys",
        "client_intake_submissions",
        "anamnesis_templates",
        "anamnesis_template_versions",
        "client_anamnesis_responses",
        "consent_records",
        "protocols",
        "protocol_versions",
        "recurring_client_tasks",
        "clients",
        "client_public_accesses",
    ):
        assert insp.has_table(table), table
    cols = {c["name"] for c in insp.get_columns("organizations")}
    assert "profession_code" in cols
    link_cols = {c["name"] for c in insp.get_columns("organization_intake_links")}
    assert "form_kind" in link_cols
    assert "is_primary" in link_cols
    anam_cols = {c["name"] for c in insp.get_columns("client_anamnesis_responses")}
    assert "questions_snapshot" in anam_cols
    engine.dispose()


def test_upgrade_from_0018_to_head(migration_db: str):
    os.environ["DATABASE_URL"] = migration_db
    to_hml = _run_alembic("upgrade", "0018_email_verification")
    assert to_hml.returncode == 0, to_hml.stdout + to_hml.stderr
    current = _run_alembic("current")
    assert "0018_email_verification" in current.stdout

    engine = create_engine(migration_db)
    with engine.begin() as conn:
        # Seed minimal legacy client before 0019 to prove preservation.
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        client_id = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO organizations (id, name, status, plan_code, timezone) "
                "VALUES (:id, 'Legacy Org', 'evaluating', 'starter', 'America/Sao_Paulo')"
            ),
            {"id": org_id},
        )
        conn.execute(
            text(
                "INSERT INTO users (id, email, password_hash, full_name, account_status) "
                "VALUES (:id, :email, 'x', 'Legacy User', 'active')"
            ),
            {"id": user_id, "email": f"legacy-{client_id.hex[:8]}@example.com"},
        )
        conn.execute(
            text(
                "INSERT INTO clients (id, organization_id, full_name, status) "
                "VALUES (:id, :oid, 'Cliente Legado', 'active')"
            ),
            {"id": client_id, "oid": org_id},
        )
    engine.dispose()

    to_head = _run_alembic("upgrade", "head")
    assert to_head.returncode == 0, to_head.stdout + to_head.stderr
    heads = _run_alembic("heads")
    assert "0020_prof_accomp_ux" in heads.stdout
    assert len([ln for ln in heads.stdout.strip().splitlines() if ln.strip()]) == 1

    engine = create_engine(migration_db)
    with engine.connect() as conn:
        name = conn.execute(
            text("SELECT full_name FROM clients WHERE id = :id"), {"id": client_id}
        ).scalar_one()
        assert name == "Cliente Legado"
        # Intake tables exist; no forced journey for legacy client.
        count = conn.execute(
            text("SELECT count(*) FROM client_journeys WHERE client_id = :id"),
            {"id": client_id},
        ).scalar_one()
        assert count == 0
        # Key unique constraint for intake tokens
        constraints = conn.execute(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conname = 'uq_organization_intake_links_token_hash'"
            )
        ).fetchall()
        assert constraints
        # 0020 profession column present and nullable for legacy orgs
        code = conn.execute(
            text("SELECT profession_code FROM organizations WHERE id = :id"),
            {"id": org_id},
        ).scalar_one()
        assert code is None
    engine.dispose()


def test_upgrade_from_0019_to_0020(migration_db: str):
    os.environ["DATABASE_URL"] = migration_db
    to_19 = _run_alembic("upgrade", "0019_client_intake_journey")
    assert to_19.returncode == 0, to_19.stdout + to_19.stderr
    to_20 = _run_alembic("upgrade", "head")
    assert to_20.returncode == 0, to_20.stdout + to_20.stderr
    current = _run_alembic("current")
    assert "0020_prof_accomp_ux" in current.stdout
