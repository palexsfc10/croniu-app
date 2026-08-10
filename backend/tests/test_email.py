"""Tests for transactional e-mail (fake provider) and verification tokens."""

from __future__ import annotations

from app.email.factory import get_shared_fake_provider, reset_email_provider_cache
from app.email.messages import password_reset_email
from app.email.protocols import EmailMessage
from app.models.user import User
from sqlalchemy import select


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
    assert all("dev_reset_token" not in (m.text_body or "") for m in fake.sent)


def test_email_verification_flow(client, register_payload, db_session):
    reset_email_provider_cache()
    client.post("/api/v1/auth/register", json=register_payload)
    fake = get_shared_fake_provider()
    assert any(m.tags == ("welcome",) for m in fake.sent)
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

    # One-time use
    again = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": token},
    )
    assert again.status_code == 400


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
