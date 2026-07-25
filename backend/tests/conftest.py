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
    Appointment,
    Client,
    Cycle,
    Location,
    Membership,
    Organization,
    PasswordResetToken,
    PlatformMembership,
    PlatformSession,
    Receivable,
    Service,
    Session,
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


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    _ensure_test_database()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    with engine.begin() as conn:
        conn.execute(
            text(
                "TRUNCATE TABLE appointments, locations, password_reset_tokens, "
                "receivables, cycles, services, clients, "
                "admin_audit_logs, platform_sessions, platform_memberships, "
                "sessions, memberships, users, organizations "
                "RESTART IDENTITY CASCADE"
            )
        )
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
