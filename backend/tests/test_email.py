"""Tests for transactional e-mail (fake provider), verification, and hard-gate."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.email.factory import get_shared_fake_provider, reset_email_provider_cache
from app.email.messages import password_reset_email
from app.email.protocols import EmailMessage
from app.models.user import User
from app.security.client_ip import request_client_ip
from app.security.rate_limit import public_rate_limiter
from starlette.requests import Request


def test_fake_provider_idempotency():
    reset_email_provider_cache()
    provider = get_shared_fake_provider()
    message = EmailMessage(
        to="a@example.com",
        subject="x",
        text_body="y",
        idempotency_key="same-key",
        tags=("t",),
    )
    first = provider.send(message)
    second = provider.send(message)
    assert first.accepted and second.accepted
    assert len(provider.sent) == 1


def test_password_reset_sends_email(client, register_payload):
    reset_email_provider_cache()
    client.post("/api/v1/auth/register", json=register_payload)
    response = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": register_payload["email"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["dev_reset_token"]
    fake = get_shared_fake_provider()
    assert any(m.tags == ("password_reset",) for m in fake.sent)


def test_email_verification_flow(client, register_payload, db_session):
    reset_email_provider_cache()
    client.post("/api/v1/auth/register", json=register_payload)
    fake = get_shared_fake_provider()
    assert not any(m.tags == ("welcome",) for m in fake.sent)
    assert any(m.tags == ("email_verification",) for m in fake.sent)

    user = db_session.scalar(select(User).where(User.email == register_payload["email"]))
    assert user is not None
    assert user.email_verified_at is None

    resend = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": register_payload["email"]},
    )
    assert resend.status_code == 200
    token = resend.json()["dev_verification_token"]
    assert token

    confirm = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": token},
    )
    assert confirm.status_code == 200
    db_session.refresh(user)
    assert user.email_verified_at is not None
    assert any(m.tags == ("welcome",) for m in get_shared_fake_provider().sent)

    again = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": token},
    )
    # Idempotent: already confirmed + consumed token still succeeds.
    assert again.status_code == 200
    db_session.refresh(user)
    assert user.email_verified_at is not None


def test_email_verification_unknown_email_no_enumeration(client):
    reset_email_provider_cache()
    response = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": "nobody@example.com"},
    )
    assert response.status_code == 200
    assert response.json()["dev_verification_token"] is None
    assert get_shared_fake_provider().sent == []


def test_password_reset_message_contains_no_api_key():
    message = password_reset_email(
        to="a@example.com",
        token="tok",
        app_public_url="https://app.croniu.com.br",
        reply_to=None,
        idempotency_key="k",
    )
    assert "https://app.croniu.com.br/reset-password?token=tok" in message.text_body
    assert "RESEND" not in message.text_body


def test_email_verification_required_blocks_login_and_session(client, register_payload, monkeypatch):
    reset_email_provider_cache()
    public_rate_limiter.reset()
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "true")
    get_settings.cache_clear()

    created = client.post("/api/v1/auth/register", json=register_payload)
    assert created.status_code == 201
    assert created.json()["requires_email_verification"] is True
    assert client.cookies.get("croniu_session") is None

    denied = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "email_unverified"

    token = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": register_payload["email"]},
    ).json()["dev_verification_token"]
    assert (
        client.post("/api/v1/auth/email-verification/confirm", json={"token": token}).status_code
        == 200
    )

    ok = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert ok.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200

    monkeypatch.delenv("EMAIL_VERIFICATION_REQUIRED", raising=False)
    get_settings.cache_clear()


def test_email_verification_invalid_and_expired_tokens(client, register_payload, db_session, monkeypatch):
    from datetime import UTC, datetime, timedelta

    from app.models.email_verification_token import EmailVerificationToken

    reset_email_provider_cache()
    public_rate_limiter.reset()
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "true")
    get_settings.cache_clear()

    client.post("/api/v1/auth/register", json=register_payload)
    bad = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": "token-invalido-sem-chance-de-existir"},
    )
    assert bad.status_code == 400
    assert bad.json()["code"] == "invalid_verification_token"

    token = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": register_payload["email"]},
    ).json()["dev_verification_token"]
    user = db_session.scalar(select(User).where(User.email == register_payload["email"]))
    assert user is not None
    record = db_session.scalars(
        select(EmailVerificationToken)
        .where(EmailVerificationToken.user_id == user.id)
        .order_by(EmailVerificationToken.created_at.desc())
    ).first()
    assert record is not None
    record.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.add(record)
    db_session.commit()

    expired = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": token},
    )
    assert expired.status_code == 400
    assert expired.json()["code"] == "expired_verification_token"
    db_session.refresh(user)
    assert user.email_verified_at is None

    monkeypatch.delenv("EMAIL_VERIFICATION_REQUIRED", raising=False)
    get_settings.cache_clear()


def test_email_verification_resend_invalidates_previous_token(client, register_payload, db_session):
    reset_email_provider_cache()
    public_rate_limiter.reset()
    client.post("/api/v1/auth/register", json=register_payload)
    first = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": register_payload["email"]},
    ).json()["dev_verification_token"]
    second = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": register_payload["email"]},
    ).json()["dev_verification_token"]
    assert first and second and first != second

    stale = client.post("/api/v1/auth/email-verification/confirm", json={"token": first})
    assert stale.status_code == 400
    assert stale.json()["code"] == "invalid_verification_token"

    ok = client.post("/api/v1/auth/email-verification/confirm", json={"token": second})
    assert ok.status_code == 200
    user = db_session.scalar(select(User).where(User.email == register_payload["email"]))
    assert user is not None
    assert user.email_verified_at is not None


def test_password_reset_does_not_confirm_pending_email(client, register_payload, db_session, monkeypatch):
    reset_email_provider_cache()
    public_rate_limiter.reset()
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "true")
    get_settings.cache_clear()

    client.post("/api/v1/auth/register", json=register_payload)
    requested = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": register_payload["email"]},
    )
    assert requested.status_code == 200
    token = requested.json()["dev_reset_token"]
    assert token

    new_password = "NovaSenhaForte9!"
    confirmed = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "password": new_password},
    )
    assert confirmed.status_code == 200

    user = db_session.scalar(select(User).where(User.email == register_payload["email"]))
    assert user is not None
    assert user.email_verified_at is None

    denied = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": new_password},
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "email_unverified"

    monkeypatch.delenv("EMAIL_VERIFICATION_REQUIRED", raising=False)
    get_settings.cache_clear()


def test_password_reset_works_after_email_confirmed(client, register_payload, monkeypatch):
    reset_email_provider_cache()
    public_rate_limiter.reset()
    monkeypatch.setenv("EMAIL_VERIFICATION_REQUIRED", "true")
    get_settings.cache_clear()

    client.post("/api/v1/auth/register", json=register_payload)
    verify_token = client.post(
        "/api/v1/auth/email-verification/request",
        json={"email": register_payload["email"]},
    ).json()["dev_verification_token"]
    assert (
        client.post("/api/v1/auth/email-verification/confirm", json={"token": verify_token}).status_code
        == 200
    )

    reset_token = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": register_payload["email"]},
    ).json()["dev_reset_token"]
    new_password = "OutraSenhaForte8!"
    assert (
        client.post(
            "/api/v1/auth/password-reset/confirm",
            json={"token": reset_token, "password": new_password},
        ).status_code
        == 200
    )

    old = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert old.status_code == 401
    ok = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": new_password},
    )
    assert ok.status_code == 200

    monkeypatch.delenv("EMAIL_VERIFICATION_REQUIRED", raising=False)
    get_settings.cache_clear()


def test_provider_failure_does_not_mark_email_verified(client, register_payload, db_session, monkeypatch):
    reset_email_provider_cache()
    public_rate_limiter.reset()

    class BoomProvider:
        def send(self, message):  # noqa: ANN001
            raise RuntimeError("provider down")

    monkeypatch.setattr("app.services.email_flow.get_email_provider", lambda _settings: BoomProvider())
    created = client.post("/api/v1/auth/register", json=register_payload)
    assert created.status_code == 201
    user = db_session.scalar(select(User).where(User.email == register_payload["email"]))
    assert user is not None
    assert user.email_verified_at is None


def test_email_verification_link_uses_app_public_url(register_payload, monkeypatch):
    from app.email.messages import email_verification_email

    message = email_verification_email(
        to=register_payload["email"],
        token="tok",
        app_public_url="https://app.croniu.com.br",
        reply_to=None,
        idempotency_key="k",
    )
    assert "https://app.croniu.com.br/verify-email?token=tok" in message.text_body
    assert "hml" not in message.text_body.lower()


def test_production_email_from_must_use_send_domain(monkeypatch):
    from app.config import Settings

    get_settings.cache_clear()
    monkeypatch.setenv("CRONIU_ENV", "production")
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("EMAIL_FROM", "Croniu <no-reply@croniu.com.br>")
    settings = Settings()
    with pytest.raises(ValueError, match="send.croniu.com.br"):
        settings.validate_production_email_from()

    monkeypatch.setenv("EMAIL_FROM", "Croniu <no-reply@send.croniu.com.br>")
    ok = Settings()
    ok.validate_production_email_from()
    assert ok.email_from_domain == "send.croniu.com.br"

    monkeypatch.delenv("CRONIU_ENV", raising=False)
    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    get_settings.cache_clear()


def test_client_ip_ignores_spoofed_headers_without_trust(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("TRUST_PROXY", "false")
    get_settings.cache_clear()
    settings = get_settings()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(b"cf-connecting-ip", b"203.0.113.9"), (b"x-forwarded-for", b"198.51.100.7")],
        "client": ("10.0.0.8", 12345),
        "server": ("test", 80),
        "scheme": "http",
    }
    request = Request(scope)
    assert request_client_ip(request, settings) == "10.0.0.8"


def test_client_ip_trusts_cf_only_from_trusted_peer(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("TRUST_PROXY", "true")
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "127.0.0.1")
    get_settings.cache_clear()
    settings = get_settings()

    trusted = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(b"cf-connecting-ip", b"203.0.113.9")],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
        "scheme": "http",
    }
    assert request_client_ip(Request(trusted), settings) == "203.0.113.9"

    spoofed = dict(trusted)
    spoofed["client"] = ("203.0.113.50", 99)
    spoofed["headers"] = [(b"cf-connecting-ip", b"198.51.100.7")]
    assert request_client_ip(Request(spoofed), settings) == "203.0.113.50"

    monkeypatch.delenv("TRUST_PROXY", raising=False)
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    get_settings.cache_clear()
