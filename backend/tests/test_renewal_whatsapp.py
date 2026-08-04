"""WhatsApp renewal contact: normalize, encode URL, no auto-confirm."""

from __future__ import annotations

from urllib.parse import parse_qs, unquote, urlparse

from fastapi.testclient import TestClient

from app.services.my_cycle import (
    _normalize_whatsapp_e164,
    build_renewal_whatsapp_url,
)
from app.services.auth import AuthError
import pytest


def test_normalize_whatsapp_adds_country_code():
    assert _normalize_whatsapp_e164("(11) 99999-9999") == "5511999999999"
    assert _normalize_whatsapp_e164("55 11 98888-7777") == "5511988887777"


def test_normalize_whatsapp_rejects_invalid():
    with pytest.raises(AuthError):
        _normalize_whatsapp_e164("123")
    with pytest.raises(AuthError):
        _normalize_whatsapp_e164("abc")


def test_whatsapp_url_is_encoded_and_safe():
    url = build_renewal_whatsapp_url(
        e164="5511999999999",
        professional_first_name="Ana",
        client_full_name="Renata Silva",
        amount_cents=72000,
    )
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "wa.me"
    assert parsed.path == "/5511999999999"
    text = unquote(parse_qs(parsed.query)["text"][0])
    assert "Renata Silva" in text
    assert "R$ 720,00" in text
    assert "Ana" in text
    assert "token" not in text.lower()
    assert "/c/" not in text
    assert "pix@" not in text.lower()


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _seed(client: TestClient, key: str) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Renata Silva", "phone": "11988887777"}
    ).json()["id"]
    service_id = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_price_cents": 9000,
            "default_duration_minutes": 60,
        },
    ).json()["id"]
    template_id = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    ).json()["id"]
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": "2026-07-01",
            "weekdays": [1, 3],
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    return {"client_id": client_id, "cycle_id": created.json()["id"], "value_cents": created.json()["value_cents"]}


def test_whatsapp_only_on_renewal_and_declare_does_not_create_cycle(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client, "wa-ren-1")
    bad = client.put(
        "/api/v1/organization/payment-settings",
        json={"whatsapp_enabled": True, "whatsapp_e164": "99", "show_on_my_cycle": False},
    )
    assert bad.status_code == 422
    ok = client.put(
        "/api/v1/organization/payment-settings",
        json={
            "holder_name": "Ana Pro",
            "whatsapp_e164": "11999998888",
            "whatsapp_enabled": True,
            "show_on_my_cycle": True,
            "pix_key_type": "email",
            "pix_key": "pix@studio.com",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["whatsapp_e164"] == "5511999998888"

    token = client.post(f"/api/v1/clients/{ids['client_id']}/public-access").json()["token"]
    pub = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub["payment_instructions"]["configured"] is False
    assert pub["renewal_whatsapp"]["available"] is True
    assert pub["renewal_whatsapp"]["whatsapp_url"].startswith("https://wa.me/5511999998888?")

    before = len(client.get("/api/v1/cycles").json())
    assert client.post(f"/api/v1/public/my-cycle/{token}/renewal").status_code == 200
    declared = client.post(f"/api/v1/public/my-cycle/{token}/renewal/declare-payment")
    assert declared.status_code == 200
    assert declared.json()["status"] == "payment_reported"
    assert "ainda não foi iniciado" in declared.json()["message"].lower()
    assert len(client.get("/api/v1/cycles").json()) == before

    disabled = client.put(
        "/api/v1/organization/payment-settings",
        json={
            "whatsapp_e164": "5511999998888",
            "whatsapp_enabled": False,
            "show_on_my_cycle": True,
        },
    )
    assert disabled.status_code == 200
    pub2 = client.get(f"/api/v1/public/my-cycle/{token}").json()
    assert pub2["renewal_whatsapp"]["available"] is False
