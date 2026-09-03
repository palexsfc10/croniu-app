"""Cadastro enxuto + WhatsApp de contato do profissional (onboarding pós-login).

Cobre:
- POST /auth/register não exige nem recebe campos de profissão e já expõe
  onboarding_required (mesmo cálculo usado por /auth/google).
- GET/PATCH /users/me/whatsapp-consent: normalização E.164, consentimento
  explícito nunca implícito, revogação, limpeza do número, isolamento entre
  usuários — tudo aditivo, zero coluna tocada em `organizations`.
"""

from __future__ import annotations

import uuid


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_register_minimal_payload_has_no_required_profession_fields(client, register_payload):
    assert "profession_code" not in register_payload
    body = _register(client, register_payload)
    assert body["organization"]["profession_code"] is None
    assert body["organization"]["profession_onboarding_done"] is False
    assert body["onboarding_required"] is True
    assert body["user"]["contact_whatsapp_e164"] is None
    assert body["user"]["whatsapp_marketing_consent_at"] is None


def test_register_still_accepts_profession_fields_for_backward_compat(client, register_payload):
    register_payload["profession_code"] = "personal_trainer"
    body = _register(client, register_payload)
    assert body["organization"]["profession_code"] == "personal_trainer"
    assert body["organization"]["profession_onboarding_done"] is True
    assert body["onboarding_required"] is False


def test_whatsapp_consent_get_defaults_to_null(client, register_payload):
    _register(client, register_payload)
    res = client.get("/api/v1/users/me/whatsapp-consent")
    assert res.status_code == 200, res.text
    assert res.json() == {"contact_whatsapp_e164": None, "whatsapp_marketing_consent_at": None}


def test_whatsapp_consent_rejects_invalid_number(client, register_payload):
    _register(client, register_payload)
    res = client.patch("/api/v1/users/me/whatsapp-consent", json={"contact_whatsapp_e164": "123"})
    assert res.status_code == 422, res.text
    assert res.json()["code"] == "invalid_whatsapp"


def test_whatsapp_consent_normalizes_br_local_number_without_granting_consent(
    client, register_payload
):
    _register(client, register_payload)
    res = client.patch(
        "/api/v1/users/me/whatsapp-consent", json={"contact_whatsapp_e164": "(11) 99999-0000"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["contact_whatsapp_e164"] == "5511999990000"
    assert body["whatsapp_marketing_consent_at"] is None


def test_whatsapp_consent_cannot_be_granted_without_a_number(client, register_payload):
    _register(client, register_payload)
    res = client.patch("/api/v1/users/me/whatsapp-consent", json={"consent_granted": True})
    assert res.status_code == 422, res.text
    assert res.json()["code"] == "whatsapp_required_for_consent"


def test_whatsapp_consent_granted_together_with_number_sets_timestamp_and_version(
    client, register_payload
):
    _register(client, register_payload)
    res = client.patch(
        "/api/v1/users/me/whatsapp-consent",
        json={"contact_whatsapp_e164": "11999990000", "consent_granted": True},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["contact_whatsapp_e164"] == "5511999990000"
    assert body["whatsapp_marketing_consent_at"] is not None

    me = client.get("/api/v1/auth/me").json()
    assert me["user"]["whatsapp_marketing_consent_at"] == body["whatsapp_marketing_consent_at"]


def test_whatsapp_consent_can_be_revoked_keeping_the_number(client, register_payload):
    _register(client, register_payload)
    client.patch(
        "/api/v1/users/me/whatsapp-consent",
        json={"contact_whatsapp_e164": "11999990000", "consent_granted": True},
    )
    res = client.patch("/api/v1/users/me/whatsapp-consent", json={"consent_granted": False})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["contact_whatsapp_e164"] == "5511999990000"
    assert body["whatsapp_marketing_consent_at"] is None


def test_whatsapp_consent_empty_string_clears_number_and_consent(client, register_payload):
    _register(client, register_payload)
    client.patch(
        "/api/v1/users/me/whatsapp-consent",
        json={"contact_whatsapp_e164": "11999990000", "consent_granted": True},
    )
    res = client.patch("/api/v1/users/me/whatsapp-consent", json={"contact_whatsapp_e164": ""})
    assert res.status_code == 200, res.text
    assert res.json() == {"contact_whatsapp_e164": None, "whatsapp_marketing_consent_at": None}


def test_whatsapp_consent_accepts_international_number_with_explicit_ddi(client, register_payload):
    # 10/11-digit input is treated as a bare BR local number (same
    # convention as app.services.my_cycle._normalize_whatsapp_e164) — a
    # non-BR number must be typed with its own DDI long enough to disambiguate.
    _register(client, register_payload)
    res = client.patch(
        "/api/v1/users/me/whatsapp-consent", json={"contact_whatsapp_e164": "447911123456"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["contact_whatsapp_e164"] == "447911123456"


def test_whatsapp_consent_is_isolated_per_user_session(client, register_payload):
    _register(client, register_payload)
    client.patch(
        "/api/v1/users/me/whatsapp-consent",
        json={"contact_whatsapp_e164": "11999990000", "consent_granted": True},
    )
    client.post("/api/v1/auth/logout")

    suffix = uuid.uuid4().hex[:8]
    second_payload = {
        "email": f"pro_{suffix}@example.com",
        "password": "SenhaForte1!",
        "full_name": "Segunda Profissional",
        "organization_name": f"Studio {suffix}",
    }
    _register(client, second_payload)
    res = client.get("/api/v1/users/me/whatsapp-consent")
    assert res.status_code == 200, res.text
    assert res.json() == {"contact_whatsapp_e164": None, "whatsapp_marketing_consent_at": None}
