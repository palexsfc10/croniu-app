"""Regression: financial invariants must hold on BOTH /intelligent and /financial."""

from __future__ import annotations

from unittest.mock import patch

from app.services.auth import AuthError
from app.services.cycle_intelligence import (
    FINANCIAL_INPUT_KEYS,
    STRUCTURAL_RECALC_KEYS,
    _guard_financial_outcome_mutation,
)
from fastapi.testclient import TestClient


def _register(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _cycle_720(client: TestClient, register_payload: dict, *, key: str) -> dict:
    _register(client, register_payload)
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Ana Souza", "phone": "11999990000"}
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
            "starts_on": "2026-08-01",
            "weekdays": [1, 3],
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["value_cents"] == 72000
    return {
        "cycle_id": created.json()["id"],
        "client_id": client_id,
        "service_id": service_id,
        "template_id": template_id,
    }


def _mark_paid(client: TestClient) -> str:
    recv_id = client.get("/api/v1/receivables").json()[0]["id"]
    assert client.post(f"/api/v1/receivables/{recv_id}/mark-paid", json={}).status_code == 200
    return recv_id


def test_intelligent_blocks_adjustment_when_paid(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-adj")
    _mark_paid(client)
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"adjustment_cents": -6000},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "payment_confirmed"


def test_intelligent_blocks_final_when_paid(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-final")
    _mark_paid(client)
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"final_cents": 50000},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "payment_confirmed"


def test_intelligent_blocks_structural_recalc_when_paid(client, register_payload):
    """Former bypass: change starts_on/weekdays without adjustment/final."""
    ids = _cycle_720(client, register_payload, key="inv-struct")
    recv_id = _mark_paid(client)
    before = client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"starts_on": "2026-09-01"},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "payment_confirmed"
    after = client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()
    assert after["value_cents"] == before["value_cents"]
    assert after["lesson_count"] == before["lesson_count"]
    assert after["starts_on"] == before["starts_on"]
    assert client.get(f"/api/v1/receivables/{recv_id}").json()["amount_cents"] == 72000


def test_intelligent_rejects_unit_price(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-unit")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"unit_price_cents": 100},
    )
    assert res.status_code == 422
    assert res.json()["code"] == "snapshot_immutable"


def test_intelligent_rejects_subtotal_extra(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-sub")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"subtotal_cents": 1},
    )
    assert res.status_code == 422
    assert res.json()["code"] == "validation_error"


def test_financial_rejects_snapshot_extras(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-f-extra")
    for payload in (
        {"unit_price_cents": 1, "final_cents": 66000},
        {"subtotal_cents": 1, "final_cents": 66000},
        {"lesson_count": 1, "final_cents": 66000},
    ):
        res = client.patch(
            f"/api/v1/cycles/{ids['cycle_id']}/financial",
            json=payload,
        )
        assert res.status_code == 422, payload
        assert res.json()["code"] == "validation_error"


def test_intelligent_updates_pending_receivable_no_duplicate(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-pend")
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"adjustment_cents": -6000},
    )
    assert res.status_code == 200, res.text
    assert res.json()["value_cents"] == 66000
    recv = client.get("/api/v1/receivables").json()
    assert len(recv) == 1
    assert recv[0]["amount_cents"] == 66000
    assert recv[0]["status"] == "pending"


def test_intelligent_rollback_on_sync_failure(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-rb")
    with patch(
        "app.services.cycle_intelligence._sync_pending_receivable",
        side_effect=AuthError("forced_fail", "falha forçada", 500),
    ):
        res = client.patch(
            f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
            json={"final_cents": 66000},
        )
    assert res.status_code == 500
    assert client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()["value_cents"] == 72000
    assert client.get("/api/v1/receivables").json()[0]["amount_cents"] == 72000


def test_financial_rollback_on_sync_failure(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-rb-f")
    with patch(
        "app.services.cycle_intelligence._sync_pending_receivable",
        side_effect=AuthError("forced_fail", "falha forçada", 500),
    ):
        res = client.patch(
            f"/api/v1/cycles/{ids['cycle_id']}/financial",
            json={"final_cents": 66000},
        )
    assert res.status_code == 500
    assert client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()["value_cents"] == 72000
    assert len(client.get("/api/v1/receivables").json()) == 1
    assert client.get("/api/v1/receivables").json()[0]["amount_cents"] == 72000


def test_intelligent_tenant_isolation(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-iso-a")
    cycle_id = ids["cycle_id"]
    client.post("/api/v1/auth/logout")
    other = {
        "email": "inv_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Studio Outro",
    }
    _register(client, other)
    res = client.patch(
        f"/api/v1/cycles/{cycle_id}/intelligent",
        json={"final_cents": 100},
    )
    assert res.status_code == 404


def test_financial_route_same_paid_protections(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-parity")
    _mark_paid(client)
    for path_suffix, body in (
        ("financial", {"adjustment_cents": -1000}),
        ("financial", {"final_cents": 50000}),
        ("intelligent", {"adjustment_cents": -1000}),
        ("intelligent", {"final_cents": 50000}),
        ("intelligent", {"weekdays": [1, 3]}),
    ):
        res = client.patch(
            f"/api/v1/cycles/{ids['cycle_id']}/{path_suffix}",
            json=body,
        )
        assert res.status_code == 409, (path_suffix, body, res.text)
        assert res.json()["code"] == "payment_confirmed"


def test_shared_guard_covers_financial_and_structural_keys():
    assert "adjustment_cents" in FINANCIAL_INPUT_KEYS
    assert "final_cents" in FINANCIAL_INPUT_KEYS
    assert "starts_on" in STRUCTURAL_RECALC_KEYS
    assert "weekdays" in STRUCTURAL_RECALC_KEYS
    assert "service_id" in STRUCTURAL_RECALC_KEYS
    assert "cycle_template_id" in STRUCTURAL_RECALC_KEYS

    class _Fake:
        receivables = [type("R", (), {"status": "received"})()]

    try:
        _guard_financial_outcome_mutation(_Fake(), {"starts_on": "2026-09-01"})
        raised = False
    except AuthError as exc:
        raised = True
        assert exc.code == "payment_confirmed"
        assert exc.status_code == 409
    assert raised


def test_paid_allows_non_financial_notes_on_intelligent(client, register_payload):
    ids = _cycle_720(client, register_payload, key="inv-notes")
    _mark_paid(client)
    res = client.patch(
        f"/api/v1/cycles/{ids['cycle_id']}/intelligent",
        json={"notes": "Observação sem impacto financeiro"},
    )
    assert res.status_code == 200, res.text
    assert client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()["value_cents"] == 72000
