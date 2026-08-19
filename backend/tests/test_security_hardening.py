"""OWASP audit hardening — fail-closed config contracts + feedback IDOR fix.

See docs of the referral program's BILLING_SANDBOX_ALLOW_ALL contract for the
established pattern: these validators only fire in production, never HML/dev,
so a misconfigured non-prod environment can't be locked out by accident.
"""

from __future__ import annotations

import uuid

import pytest
from app.config import Settings
from app.models.platform_membership import PlatformMembership
from app.models.user import User
from app.security.passwords import hash_password


def _base_settings(monkeypatch, **overrides: str) -> Settings:
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-at-least-32-characters-long")
    for key, value in overrides.items():
        monkeypatch.setenv(key, value)
    return Settings()


# --- ASAAS_WEBHOOK_TOKEN fail-closed ---------------------------------------


def test_asaas_webhook_token_required_in_production_when_billing_enabled(monkeypatch):
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="production",
        BILLING_ENABLED="true",
        ASAAS_WEBHOOK_TOKEN="",
    )
    with pytest.raises(ValueError, match="ASAAS_WEBHOOK_TOKEN"):
        settings.validate_asaas_webhook_token_contract()


def test_asaas_webhook_token_not_required_when_billing_disabled(monkeypatch):
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="production",
        BILLING_ENABLED="false",
        ASAAS_WEBHOOK_TOKEN="",
    )
    settings.validate_asaas_webhook_token_contract()  # must not raise


def test_asaas_webhook_token_not_required_outside_production(monkeypatch):
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="hml",
        BILLING_ENABLED="true",
        ASAAS_WEBHOOK_TOKEN="",
    )
    settings.validate_asaas_webhook_token_contract()  # must not raise — HML untouched


def test_asaas_webhook_token_present_passes(monkeypatch):
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="production",
        BILLING_ENABLED="true",
        ASAAS_WEBHOOK_TOKEN="whk_real_token",
    )
    settings.validate_asaas_webhook_token_contract()  # must not raise


# --- SESSION_COOKIE_SECURE fail-closed --------------------------------------


def test_session_cookie_secure_required_in_production(monkeypatch):
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="production",
        SESSION_COOKIE_SECURE="false",
    )
    with pytest.raises(ValueError, match="SESSION_COOKIE_SECURE"):
        settings.validate_session_cookie_secure_contract()


def test_session_cookie_secure_not_required_outside_production(monkeypatch):
    """HML intentionally runs with SESSION_COOKIE_SECURE=false today — must stay untouched."""
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="hml",
        SESSION_COOKIE_SECURE="false",
    )
    settings.validate_session_cookie_secure_contract()  # must not raise


def test_session_cookie_secure_true_passes(monkeypatch):
    settings = _base_settings(
        monkeypatch,
        CRONIU_ENV="production",
        SESSION_COOKIE_SECURE="true",
    )
    settings.validate_session_cookie_secure_contract()  # must not raise


# --- IDOR: PATCH /platform/feedbacks/{id} must require platform_admin ------


def _create_platform_user(db, *, role: str) -> tuple[User, str]:
    password = "AdminSenhaForte1!"
    user = User(
        email=f"platform_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Usuário Plataforma",
        password_hash=hash_password(password),
        account_status="active",
    )
    db.add(user)
    db.flush()
    db.add(PlatformMembership(user_id=user.id, role=role))
    db.commit()
    db.refresh(user)
    return user, password


def _login_platform(client, email: str, password: str) -> None:
    resp = client.post("/api/v1/platform/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text


def _create_feedback(client, register_payload) -> str:
    assert client.post("/api/v1/auth/register", json=register_payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": register_payload["email"], "password": register_payload["password"]},
        ).status_code
        == 200
    )
    resp = client.post(
        "/api/v1/feedback",
        json={
            "category": "suggestion",
            "message": "Gostaria de um relatório semanal por e-mail, por favor.",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_platform_viewer_cannot_change_feedback_status(client, db_session, register_payload):
    feedback_id = _create_feedback(client, register_payload)

    viewer, viewer_password = _create_platform_user(db_session, role="platform_viewer")
    _login_platform(client, viewer.email, viewer_password)

    resp = client.patch(
        f"/api/v1/platform/feedbacks/{feedback_id}",
        json={"status": "reviewing"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "platform_forbidden"


def test_platform_admin_can_still_change_feedback_status(client, db_session, register_payload):
    """Regression guard: the fix must not break the legitimate admin happy path."""
    feedback_id = _create_feedback(client, register_payload)

    admin, admin_password = _create_platform_user(db_session, role="platform_admin")
    _login_platform(client, admin.email, admin_password)

    resp = client.patch(
        f"/api/v1/platform/feedbacks/{feedback_id}",
        json={"status": "reviewing"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "reviewing"
