"""Financial overview + o gate do recebível de R$0,00.

Cobre:
- ciclo gratuito (novo) não cria mais nenhum recebível;
- endpoint manual /receivables rejeita valor zero;
- edição financeira que zera o valor cancela o recebível pendente em vez de
  deixar um R$0,00 "pendente";
- recebível de R$0,00 pré-existente nunca conta em Home/overview/IA;
- GET /receivables/overview: recebido no mês, previsto, vencido, tendência —
  todos derivados de dados reais, sem contar duas vezes.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.models.receivable import Receivable


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _service(client, name="Aula"):
    res = client.post(
        "/api/v1/services",
        json={"name": name, "default_price_cents": 9000, "default_duration_minutes": 60},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _template(client, name="2x semana"):
    res = client.post(
        "/api/v1/cycle-templates",
        json={"name": name, "weekly_frequency": 2, "duration_type": "calendar_months", "duration_value": 1},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _client_row(client, name):
    res = client.post("/api/v1/clients", json={"full_name": name})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _intelligent_cycle(client, *, client_id, service_id, template_id, starts_on, key, unit_price_cents=None):
    body = {
        "client_id": client_id,
        "service_id": service_id,
        "cycle_template_id": template_id,
        "starts_on": starts_on.isoformat(),
        "weekdays": [0, 2],
        "starts_time": "09:00:00",
        "generate_appointments": True,
        "create_receivable": True,
        "idempotency_key": key,
    }
    if unit_price_cents is not None:
        body["unit_price_cents"] = unit_price_cents
    res = client.post("/api/v1/cycles/intelligent", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_free_cycle_creates_no_receivable_at_all(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    template_id = _template(client)
    client_id = _client_row(client, "Cliente Gratuito")
    today = date.today()
    cycle = _intelligent_cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        template_id=template_id,
        starts_on=today,
        key="free-1",
        unit_price_cents=0,
    )
    res = client.get("/api/v1/receivables")
    assert res.status_code == 200
    mine = [r for r in res.json() if r["cycle_id"] == cycle["id"]]
    assert mine == []


def test_manual_receivable_endpoint_rejects_zero_amount(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    template_id = _template(client)
    client_id = _client_row(client, "Cliente Teste")
    today = date.today()
    cycle = _intelligent_cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        template_id=template_id,
        starts_on=today,
        key="manual-1",
        unit_price_cents=0,
    )
    res = client.post(
        "/api/v1/receivables",
        json={"cycle_id": cycle["id"], "amount_cents": 0, "due_on": today.isoformat()},
    )
    assert res.status_code == 422, res.text
    assert res.json()["code"] == "amount_required"


def test_editing_a_cycle_to_zero_cancels_the_pending_receivable(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    template_id = _template(client)
    client_id = _client_row(client, "Cliente Editado")
    today = date.today()
    cycle = _intelligent_cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        template_id=template_id,
        starts_on=today,
        key="edit-to-zero",
    )
    res = client.get("/api/v1/receivables")
    before = [r for r in res.json() if r["cycle_id"] == cycle["id"]]
    assert len(before) == 1
    assert before[0]["status"] == "pending"
    assert before[0]["amount_cents"] > 0

    patched = client.patch(
        f"/api/v1/cycles/{cycle['id']}/financial", json={"final_cents": 0}
    )
    assert patched.status_code == 200, patched.text

    res = client.get("/api/v1/receivables")
    after = [r for r in res.json() if r["cycle_id"] == cycle["id"]]
    assert len(after) == 1
    assert after[0]["status"] == "cancelled"
    # The original amount is kept as the historical record of what it would
    # have been — cancellation, not erasure. Being "cancelled" alone already
    # excludes it from every pending/overdue/forecast metric.
    assert after[0]["amount_cents"] == 72000
    overview = client.get("/api/v1/receivables/overview").json()["summary"]
    assert overview["pending_count"] == 0
    assert overview["overdue_cents"] == 0


def test_preexisting_zero_value_receivable_never_counts_anywhere(client, register_payload, db_session):
    _register(client, register_payload)
    service_id = _service(client)
    template_id = _template(client)
    client_id = _client_row(client, "Cliente Legado Gratuito")
    today = date.today()
    cycle = _intelligent_cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        template_id=template_id,
        starts_on=today - timedelta(days=40),
        key="legacy-free",
        unit_price_cents=0,
    )
    # Simulate a row created before the gate fix — the code path above no
    # longer creates this, so we insert it directly to prove the READ side
    # (Home/overview/AI) is defensive against data that already exists.
    legacy = Receivable(
        id=uuid.uuid4(),
        organization_id=uuid.UUID(client.get("/api/v1/auth/me").json()["organization"]["id"]),
        cycle_id=uuid.UUID(cycle["id"]),
        client_id=uuid.UUID(client_id),
        amount_cents=0,
        due_on=today - timedelta(days=10),
        status="pending",
    )
    db_session.add(legacy)
    db_session.commit()

    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200, home.text
    body = home.json()
    assert all(p["id"] != str(legacy.id) for p in body["pending_payments"])

    overview = client.get("/api/v1/receivables/overview")
    assert overview.status_code == 200, overview.text
    assert overview.json()["summary"]["overdue_cents"] == 0
    assert overview.json()["summary"]["pending_count"] == 0


def test_overview_separates_received_forecast_and_overdue_without_double_counting(
    client, register_payload, db_session
):
    _register(client, register_payload)
    service_id = _service(client)
    template_id = _template(client)
    client_id = _client_row(client, "Cliente Financeiro")
    today = date.today()
    cycle = _intelligent_cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        template_id=template_id,
        starts_on=today,
        key="overview-1",
    )
    receivable_id = [
        r["id"] for r in client.get("/api/v1/receivables").json() if r["cycle_id"] == cycle["id"]
    ][0]

    before = client.get("/api/v1/receivables/overview").json()["summary"]
    assert before["forecast_month_cents"] >= cycle["value_cents"]
    assert before["overdue_cents"] == 0
    assert before["pending_count"] == 1

    paid = client.post(f"/api/v1/receivables/{receivable_id}/mark-paid", json={"payment_method": "pix"})
    assert paid.status_code == 200, paid.text

    after = client.get("/api/v1/receivables/overview").json()["summary"]
    assert after["received_month_cents"] == cycle["value_cents"]
    # Once received, it must never still count as forecast/pending.
    assert after["pending_count"] == 0
    assert after["forecast_month_cents"] < before["forecast_month_cents"]


def test_overview_is_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    service_id = _service(client)
    template_id = _template(client)
    client_id = _client_row(client, "Cliente Org A")
    today = date.today()
    _intelligent_cycle(
        client,
        client_id=client_id,
        service_id=service_id,
        template_id=template_id,
        starts_on=today,
        key="tenant-a",
    )
    client.post("/api/v1/auth/logout")

    suffix = uuid.uuid4().hex[:8]
    _register(
        client,
        {
            "email": f"other_{suffix}@example.com",
            "password": "SenhaForte1!",
            "full_name": "Outra Profissional",
            "organization_name": f"Outro Studio {suffix}",
        },
    )
    overview = client.get("/api/v1/receivables/overview").json()
    assert overview["summary"] == {
        "received_month_cents": 0,
        "forecast_month_cents": 0,
        "overdue_cents": 0,
        "overdue_count": 0,
        "pending_count": 0,
    }
