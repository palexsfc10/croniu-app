from __future__ import annotations

import uuid

from app.models.admin_audit_log import AdminAuditLog
from app.models.platform_membership import PlatformMembership
from app.models.user import User
from app.security.passwords import hash_password
from sqlalchemy import select


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

    overview = client.get("/api/v1/platform/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert body["organizations_total"] >= 1
    assert body["professionals_total"] >= 1
    assert body["clients_active_total"] == 0
    assert "generated_at" in body

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


def test_org_detail_and_logout(client, db_session, register_payload):
    reg = client.post("/api/v1/auth/register", json=register_payload)
    org_id = reg.json()["organization"]["id"]
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    password = "AdminSenhaForte1!"
    _create_platform_admin(db_session, email, password)
    client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})

    detail = client.get(f"/api/v1/platform/organizations/{org_id}")
    assert detail.status_code == 200
    assert detail.json()["id"] == org_id

    logout = client.post("/api/v1/platform/auth/logout")
    assert logout.status_code == 200
    assert client.get("/api/v1/platform/overview").status_code == 401
