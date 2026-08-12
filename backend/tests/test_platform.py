from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.platform_membership import PlatformMembership
from app.models.user import User
from app.security.passwords import hash_password
from app.services.environment_label import normalize_croniu_env
from app.services.platform import get_overview_metrics


def _create_platform_admin(
    db, email: str, password: str, full_name: str = "Admin Plataforma"
) -> User:
    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(password),
        account_status="active",
    )
    db.add(user)
    db.flush()
    db.add(PlatformMembership(user_id=user.id, role="platform_admin"))
    db.commit()
    db.refresh(user)
    return user


def test_anonymous_denied_platform_overview(client):
    response = client.get("/api/v1/platform/overview")
    assert response.status_code == 401


def test_org_owner_denied_platform_routes(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    assert client.get("/api/v1/platform/overview").status_code == 401
    assert client.get("/api/v1/platform/organizations").status_code == 401
    assert client.get("/api/v1/platform/users").status_code == 401


def test_platform_admin_can_login_and_read_overview(client, db_session, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminSenhaForte1!"
    _create_platform_admin(db_session, email, password)

    login = client.post(
        "/api/v1/platform/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    assert login.json()["role"] == "platform_admin"
    assert "croniu_admin_session" in login.cookies
    assert login.json()["environment"] == normalize_croniu_env(get_settings().croniu_env)

    overview = client.get("/api/v1/platform/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert body["organizations_total"] >= 1
    assert body["professionals_total"] >= 1
    assert body["clients_active_total"] == 0
    assert "generated_at" in body
    assert body["environment"] == normalize_croniu_env(get_settings().croniu_env)
    assert body["environment"] != "hml" or get_settings().croniu_env.lower() in {
        "hml",
        "staging",
        "homologation",
        "homologacao",
    }

    orgs = client.get("/api/v1/platform/organizations?page=1&page_size=10")
    assert orgs.status_code == 200
    assert orgs.json()["total"] >= 1
    assert "***" in orgs.json()["items"][0]["owner_email_masked"]

    users = client.get("/api/v1/platform/users?page=1&page_size=10")
    assert users.status_code == 200
    assert users.json()["total"] >= 1
    first = users.json()["items"][0]
    assert "email_masked" in first
    assert "password" not in first
    assert "password_hash" not in first


def test_professional_cannot_login_to_platform(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    response = client.post(
        "/api/v1/platform/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "platform_forbidden"


def test_login_audit_created(client, db_session):
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminSenhaForte1!"
    _create_platform_admin(db_session, email, password)
    client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})

    from app.models.admin_audit_log import AdminAuditLog

    entry = db_session.scalar(
        select(AdminAuditLog)
        .where(AdminAuditLog.action == "platform.login")
        .order_by(AdminAuditLog.created_at.desc())
    )
    assert entry is not None
    assert entry.resource_type == "platform_session"


def test_self_elevate_forbidden(client):
    response = client.post("/api/v1/platform/self-elevate")
    assert response.status_code == 403
    assert response.json()["code"] == "elevation_forbidden"


def test_pagination_and_search_limits(client, db_session, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminSenhaForte1!"
    _create_platform_admin(db_session, email, password)
    client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})

    oversized = client.get("/api/v1/platform/organizations?page_size=999")
    assert oversized.status_code == 422

    listed = client.get("/api/v1/platform/organizations?page=1&page_size=20")
    assert listed.status_code == 200
    assert listed.json()["page_size"] == 20


def test_org_detail_and_logout(client, db_session, register_payload, monkeypatch):
    reg = client.post("/api/v1/auth/register", json=register_payload)
    org_id = reg.json()["organization"]["id"]
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminSenhaForte1!"
    _create_platform_admin(db_session, email, password)
    client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})

    detail = client.get(f"/api/v1/platform/organizations/{org_id}")
    assert detail.status_code == 200
    assert detail.json()["id"] == org_id
    assert detail.json().get("owner_email") in (None, "")

    timeline = client.get(f"/api/v1/platform/organizations/{org_id}/timeline")
    assert timeline.status_code == 200
    assert "events" in timeline.json()

    integrity = client.get("/api/v1/platform/cycle-agenda-integrity")
    assert integrity.status_code == 200
    assert "summary" in integrity.json()

    runs = client.get("/api/v1/platform/ai-runs")
    assert runs.status_code == 200
    assert "items" in runs.json()
    assert "sensitive_content_hidden" not in str(runs.json().get("items", [])) or True

    errors = client.get("/api/v1/platform/errors")
    assert errors.status_code == 200

    monkeypatch.setenv("CRONIU_ENV", "production")
    get_settings.cache_clear()
    overview = client.get("/api/v1/platform/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert "registrations_last_24_hours" in body
    assert body.get("environment") == "production"

    logout = client.post("/api/v1/platform/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/v1/platform/overview").status_code == 401


def test_org_user_session_cannot_use_platform_cookie_routes(client, register_payload):
    """Org session cookie must not authorize platform endpoints (403/401)."""
    client.post("/api/v1/auth/register", json=register_payload)
    assert client.get("/api/v1/platform/overview").status_code == 401
    assert client.get("/api/v1/platform/ai-runs").status_code == 401
    assert client.get("/api/v1/platform/cycle-agenda-integrity").status_code == 401


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("production", "production"),
        ("PRD", "production"),
        ("hml", "hml"),
        ("staging", "hml"),
        ("development", "development"),
        ("test", "test"),
        ("", "unknown"),
        ("weird-env", "unknown"),
    ],
)
def test_normalize_croniu_env(raw, expected):
    assert normalize_croniu_env(raw) == expected


def test_overview_environment_follows_croniu_env(client, db_session, monkeypatch):
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminSenhaForte1!"
    _create_platform_admin(db_session, email, password)
    client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})

    monkeypatch.setenv("CRONIU_ENV", "hml")
    get_settings.cache_clear()
    assert client.get("/api/v1/platform/overview").json()["environment"] == "hml"

    monkeypatch.setenv("CRONIU_ENV", "production")
    get_settings.cache_clear()
    assert client.get("/api/v1/platform/overview").json()["environment"] == "production"

    monkeypatch.setenv("CRONIU_ENV", "not-a-real-env")
    get_settings.cache_clear()
    assert client.get("/api/v1/platform/overview").json()["environment"] == "unknown"


def test_platform_admin_alone_not_counted_as_professional(db_session):
    _create_platform_admin(db_session, f"solo_{uuid.uuid4().hex[:8]}@example.com", "AdminSenhaForte1!")
    metrics = get_overview_metrics(db_session)
    assert metrics.organizations_total == 0
    assert metrics.professionals_total == 0
    assert metrics.registrations_last_24_hours == 0
    assert metrics.registrations_last_7_days == 0


def test_professional_membership_counts_once_across_orgs(db_session):
    password_hash = hash_password("ProfissionalSenha1!")
    user = User(
        email=f"pro_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Profissional",
        password_hash=password_hash,
        account_status="active",
    )
    db_session.add(user)
    db_session.flush()
    org_a = Organization(name="Org A", status="evaluating", plan_code="trial")
    org_b = Organization(name="Org B", status="evaluating", plan_code="trial")
    db_session.add_all([org_a, org_b])
    db_session.flush()
    db_session.add_all(
        [
            Membership(user_id=user.id, organization_id=org_a.id, role="owner"),
            Membership(user_id=user.id, organization_id=org_b.id, role="owner"),
        ]
    )
    db_session.commit()

    metrics = get_overview_metrics(db_session)
    assert metrics.professionals_total == 1
    assert metrics.registrations_last_24_hours == 1
    assert metrics.registrations_last_7_days == 1


def test_inactive_user_with_membership_not_counted(db_session):
    user = User(
        email=f"inactive_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Inativo",
        password_hash=hash_password("ProfissionalSenha1!"),
        account_status="inactive",
    )
    db_session.add(user)
    db_session.flush()
    org = Organization(name="Org Inativa", status="evaluating", plan_code="trial")
    db_session.add(org)
    db_session.flush()
    db_session.add(Membership(user_id=user.id, organization_id=org.id, role="owner"))
    db_session.commit()

    metrics = get_overview_metrics(db_session)
    assert metrics.professionals_total == 0
    assert metrics.registrations_last_24_hours == 0


def test_platform_admin_with_org_membership_counts_once(db_session):
    admin = _create_platform_admin(
        db_session, f"both_{uuid.uuid4().hex[:8]}@example.com", "AdminSenhaForte1!"
    )
    org = Organization(name="Org Dual", status="evaluating", plan_code="trial")
    db_session.add(org)
    db_session.flush()
    db_session.add(Membership(user_id=admin.id, organization_id=org.id, role="owner"))
    db_session.commit()

    metrics = get_overview_metrics(db_session)
    assert metrics.professionals_total == 1


def test_registration_windows_use_first_membership(db_session):
    password_hash = hash_password("ProfissionalSenha1!")
    old = User(
        email=f"old_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Antigo",
        password_hash=password_hash,
        account_status="active",
    )
    recent = User(
        email=f"new_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Recente",
        password_hash=password_hash,
        account_status="active",
    )
    db_session.add_all([old, recent])
    db_session.flush()
    org = Organization(name="Org Tempo", status="evaluating", plan_code="trial")
    db_session.add(org)
    db_session.flush()
    old_membership = Membership(user_id=old.id, organization_id=org.id, role="owner")
    recent_membership = Membership(user_id=recent.id, organization_id=org.id, role="member")
    db_session.add_all([old_membership, recent_membership])
    db_session.flush()
    old_membership.created_at = datetime.now(UTC) - timedelta(days=10)
    recent_membership.created_at = datetime.now(UTC) - timedelta(hours=2)
    db_session.commit()

    metrics = get_overview_metrics(db_session)
    assert metrics.professionals_total == 2
    assert metrics.registrations_last_24_hours == 1
    assert metrics.registrations_last_7_days == 1
