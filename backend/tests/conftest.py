from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Force dedicated test database even if a shell DATABASE_URL points at croniu.
os.environ["DATABASE_URL"] = (
    "postgresql+psycopg://croniu:croniu_dev_password_change_me@localhost:5433/croniu_test"
)
os.environ.setdefault(
    "SECRET_KEY",
    "test-secret-key-with-at-least-32-characters",
)
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("OPENAPI_ENABLED", "true")

from app.config import get_settings
from app.db import Base, get_db
from app.main import create_app
from app.models import (  # noqa: F401
    AdminAuditLog,
    AgentAuditLog,
    AgentMessage,
    AgentPendingAction,
    AgentRun,
    AgentThread,
    AgentToolCall,
    AgentUsageDaily,
    Appointment,
    BillingCheckout,
    BillingPlan,
    BillingPrice,
    BillingWebhookEvent,
    Client,
    ClientEvaluation,
    ClientEvaluationCriterion,
    ClientPublicAccess,
    Cycle,
    CycleTemplate,
    Location,
    Membership,
    Organization,
    OrganizationPaymentSettings,
    PasswordResetToken,
    PaymentProof,
    PaymentReport,
    PlatformMembership,
    PlatformSession,
    Receivable,
    RenewalRequest,
    Service,
    Session,
    Subscription,
    User,
)


get_settings.cache_clear()
settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _ensure_test_database() -> None:
    """Create croniu_test DB if missing (connects to default croniu DB)."""
    url = settings.database_url
    if "croniu_test" not in url:
        return
    admin_url = url.replace("/croniu_test", "/croniu")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = 'croniu_test'")
        ).scalar()
        if not exists:
            conn.execute(text("CREATE DATABASE croniu_test"))
    admin_engine.dispose()


def _seed_billing_catalog() -> None:
    from app.billing.service import ensure_billing_catalog

    db = TestingSessionLocal()
    try:
        ensure_billing_catalog(db)
        db.commit()
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    _ensure_test_database()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _seed_billing_catalog()
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE TABLE billing_webhook_events, billing_checkouts, subscriptions, "
                "agent_audit_logs, agent_pending_actions, agent_tool_calls, agent_runs, "
                "agent_messages, agent_threads, agent_usage_daily, "
                "client_evaluation_criteria, client_evaluations, "
                "payment_proofs, payment_reports, renewal_requests, "
                "organization_payment_settings, client_public_accesses, "
                "appointments, locations, password_reset_tokens, "
                "receivables, cycles, cycle_templates, services, clients, "
                "admin_audit_logs, platform_sessions, platform_memberships, "
                "sessions, memberships, users, organizations "
                "RESTART IDENTITY CASCADE"
            )
        )
    # Keep billing_plans / billing_prices; re-seed if cascade wiped them
    _seed_billing_catalog()
    yield


@pytest.fixture
def client():
    app = create_app()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def register_payload():
    suffix = uuid.uuid4().hex[:8]
    return {
        "email": f"pro_{suffix}@example.com",
        "password": "SenhaForte1!",
        "full_name": "Profissional Teste",
        "organization_name": f"Studio {suffix}",
    }


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
