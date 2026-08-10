"""Webhook idempotency and hosted-checkout helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.billing.asaas import AsaasBillingProvider
from app.billing.checkout_helpers import (
    build_checkout_callback_urls,
    cents_to_asaas_value,
    validate_frontend_base_url,
)
from app.billing.webhooks import BillingWebhookService
from app.config import get_settings
from app.models.billing import BillingWebhookEvent
from app.services.auth import AuthError


def test_cents_to_asaas_value_precise():
    assert cents_to_asaas_value(2990) == 29.9


def test_callback_urls_use_public_app_base(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "public_app_base_url", "https://app.example.com/")
    urls = build_checkout_callback_urls()
    assert urls["successUrl"] == "https://app.example.com/app/billing/return/success"
    assert urls["cancelUrl"] == "https://app.example.com/app/billing/return/cancel"
    assert urls["expiredUrl"] == "https://app.example.com/app/billing/return/expired"


def test_callback_rejects_invalid_base(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "public_app_base_url", "javascript:alert(1)")
    with pytest.raises(AuthError):
        validate_frontend_base_url()


def test_webhook_duplicate_returns_duplicate(db_session):
    from app.billing.service import ensure_billing_catalog

    ensure_billing_catalog(db_session)
    event_id = "evt_dup_1"
    existing = BillingWebhookEvent(
        id=uuid.uuid4(),
        provider="asaas",
        external_event_id=event_id,
        event_type="PAYMENT_CONFIRMED",
        processing_status="processed",
        attempts=1,
        payload_digest="abc",
        payload_sanitized={"event": "PAYMENT_CONFIRMED"},
    )
    db_session.add(existing)
    db_session.commit()

    provider = AsaasBillingProvider(api_key="k", webhook_token="")
    with patch("app.billing.webhooks.build_asaas_provider", return_value=provider):
        result = BillingWebhookService(db_session).handle_asaas(
            payload={
                "id": event_id,
                "event": "PAYMENT_CONFIRMED",
                "payment": {"id": "pay_1"},
            },
            access_token=None,
        )
    assert result["status"] == "duplicate"
    assert result["external_event_id"] == event_id


def test_create_hosted_checkout_mocks_asaas(client, register_payload, monkeypatch):
    get_settings.cache_clear()
    settings = get_settings()
    monkeypatch.setattr(settings, "asaas_api_key", "test_key_$aact_hmlg_x")
    monkeypatch.setattr(settings, "billing_card_enabled", True)
    monkeypatch.setattr(settings, "billing_checkout_enabled", True)
    monkeypatch.setattr(settings, "billing_enabled", True)
    monkeypatch.setattr(settings, "asaas_environment", "sandbox")
    monkeypatch.setattr(settings, "asaas_api_url", "https://sandbox.asaas.com/api/v3")

    reg = client.post("/api/v1/auth/register", json=register_payload)
    assert reg.status_code == 201

    remote = SimpleNamespace(
        id="chk_remote_1",
        link="https://sandbox.asaas.com/checkoutSession/i/xyz",
        status="ACTIVE",
        minutes_to_expire=60,
    )
    mock_provider = MagicMock()
    mock_provider.create_customer.return_value = SimpleNamespace(id="cus_1")
    mock_provider.create_hosted_checkout.return_value = remote
    mock_provider.code = "asaas"

    with patch("app.billing.service.build_asaas_provider", return_value=mock_provider):
        response = client.post(
            "/api/v1/billing/checkout",
            json={
                "billing_method": "credit_card",
                "customer": {
                    "cpf_cnpj": "52998224725",
                    "phone": "11987654321",
                    "postal_code": "01310100",
                    "address": "Av Paulista",
                    "address_number": "1000",
                    "province": "Bela Vista",
                },
            },
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "ACTIVE"
    assert body["checkout_url"] == remote.link
    assert body["amount_cents"] == 2990

    get_settings.cache_clear()
