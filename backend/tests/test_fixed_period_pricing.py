"""Fixed-period plan pricing (Entrega 2): services/cycles gain a pricing_mode
that separates the operational lesson count (agenda/progress, unchanged) from
the financial calculation. `per_lesson` preserves 100% of prior behavior;
`fixed_period` charges a flat value for the period, independent of how many
lessons are scheduled/completed/cancelled.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, payload: dict) -> None:
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text


def _create_client(client: TestClient, name: str = "Ana Souza") -> str:
    res = client.post("/api/v1/clients", json={"full_name": name, "phone": "11999990000"})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _create_service(client: TestClient, **overrides) -> dict:
    payload = {
        "name": "Personal presencial",
        "default_duration_minutes": 60,
        "default_duration_days": 30,
        "default_price_cents": 9000,
    }
    payload.update(overrides)
    res = client.post("/api/v1/services", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _create_template(client: TestClient, **overrides) -> dict:
    payload = {
        "name": "2x por semana — mensal",
        "weekly_frequency": 2,
        "duration_type": "calendar_months",
        "duration_value": 1,
    }
    payload.update(overrides)
    res = client.post("/api/v1/cycle-templates", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _setup_fixed_period_org(
    client: TestClient, register_payload: dict, *, fixed_price_cents: int = 50000, **template_overrides
) -> dict:
    _register(client, register_payload)
    client_id = _create_client(client)
    service = _create_service(
        client,
        default_price_cents=None,
        pricing_mode="fixed_period",
        fixed_price_cents=fixed_price_cents,
    )
    template = _create_template(client, **template_overrides)
    return {"client_id": client_id, "service_id": service["id"], "template_id": template["id"]}


# 1/2. Migração de registros antigos + criação por aula sem regressão
def test_service_defaults_to_per_lesson_pricing_mode(client, register_payload):
    _register(client, register_payload)
    service = _create_service(client)
    assert service["pricing_mode"] == "per_lesson"
    assert service["fixed_price_cents"] is None


def test_per_lesson_cycle_creation_unchanged(client, register_payload):
    _register(client, register_payload)
    client_id = _create_client(client)
    service = _create_service(client)
    template = _create_template(client)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service["id"],
            "cycle_template_id": template["id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
            "create_receivable": True,
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["pricing_mode"] == "per_lesson"
    assert cycle["unit_price_cents"] == 9000
    assert cycle["value_cents"] == cycle["lesson_count"] * 9000


# 3. Validação: fixed_period exige fixed_price_cents
def test_fixed_period_service_requires_fixed_price(client, register_payload):
    _register(client, register_payload)
    res = client.post(
        "/api/v1/services",
        json={
            "name": "Plano mensal",
            "default_duration_minutes": 60,
            "pricing_mode": "fixed_period",
        },
    )
    assert res.status_code == 422


def test_invalid_pricing_mode_rejected(client, register_payload):
    _register(client, register_payload)
    res = client.post(
        "/api/v1/services",
        json={
            "name": "Plano",
            "default_duration_minutes": 60,
            "pricing_mode": "subscription",
        },
    )
    assert res.status_code == 422


# 4/5/6. Mensal / trimestral / semestral — o período já existe como duration_type/value
def test_fixed_period_monthly_plan_creation(client, register_payload):
    ids = _setup_fixed_period_org(
        client, register_payload, fixed_price_cents=50000, duration_type="calendar_months", duration_value=1
    )
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
            "create_receivable": True,
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["pricing_mode"] == "fixed_period"
    assert cycle["unit_price_cents"] is None
    assert cycle["subtotal_cents"] == 50000
    assert cycle["value_cents"] == 50000
    assert cycle["ends_on"] == "2026-09-04"


def test_fixed_period_quarterly_plan_creation(client, register_payload):
    ids = _setup_fixed_period_org(
        client,
        register_payload,
        fixed_price_cents=150000,
        weekly_frequency=2,
        duration_type="calendar_months",
        duration_value=3,
    )
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["value_cents"] == 150000
    assert cycle["ends_on"] == "2026-11-04"


def test_fixed_period_semiannual_plan_creation(client, register_payload):
    ids = _setup_fixed_period_org(
        client,
        register_payload,
        fixed_price_cents=280000,
        weekly_frequency=2,
        duration_type="calendar_months",
        duration_value=6,
    )
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["value_cents"] == 280000


# 7. Período personalizado — já é fixed_days + duration_value custom no modelo de ciclo
# (não é uma terceira modalidade nova: reaproveita exatamente o mecanismo existente).
def test_fixed_period_custom_period_via_fixed_days_template(client, register_payload):
    ids = _setup_fixed_period_org(
        client,
        register_payload,
        fixed_price_cents=70000,
        name="Personalizado 45 dias",
        duration_type="fixed_days",
        duration_value=45,
    )
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["duration_type"] == "fixed_days"
    assert cycle["duration_value"] == 45
    assert cycle["ends_on"] == "2026-09-18"
    assert cycle["value_cents"] == 70000


# 8. Valor fixo não multiplica pela quantidade de aulas
def test_fixed_period_value_independent_of_lesson_frequency(client, register_payload):
    _register(client, register_payload)
    client_a = _create_client(client, "Cliente A")
    client_b = _create_client(client, "Cliente B")
    service = _create_service(
        client, default_price_cents=None, pricing_mode="fixed_period", fixed_price_cents=60000
    )
    template_2x = _create_template(client, name="2x", weekly_frequency=2)
    template_4x = _create_template(client, name="4x", weekly_frequency=4)

    cycle_2x = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_a,
            "service_id": service["id"],
            "cycle_template_id": template_2x["id"],
            "starts_on": "2026-08-03",
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
        },
    ).json()
    cycle_4x = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_b,
            "service_id": service["id"],
            "cycle_template_id": template_4x["id"],
            "starts_on": "2026-08-03",
            "weekdays": [0, 1, 2, 3],
            "starts_time": "09:00:00",
        },
    ).json()
    assert cycle_2x["lesson_count"] != cycle_4x["lesson_count"]
    assert cycle_2x["value_cents"] == cycle_4x["value_cents"] == 60000


# 9. Desconto/ajuste sobre valor fixo
def test_fixed_period_discount_via_adjustment(client, register_payload):
    ids = _setup_fixed_period_org(client, register_payload, fixed_price_cents=50000)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
            "adjustment_cents": -5000,
        },
    )
    assert created.status_code == 201, created.text
    cycle = created.json()
    assert cycle["subtotal_cents"] == 50000
    assert cycle["adjustment_cents"] == -5000
    assert cycle["value_cents"] == 45000


# 10/11. Recebível com valor final correto, sem duplicidade em retry idempotente
def test_fixed_period_receivable_matches_final_value_no_duplicate_on_retry(client, register_payload):
    ids = _setup_fixed_period_org(client, register_payload, fixed_price_cents=50000)
    payload = {
        "client_id": ids["client_id"],
        "service_id": ids["service_id"],
        "cycle_template_id": ids["template_id"],
        "starts_on": "2026-08-04",
        "weekdays": [1, 3],
        "starts_time": "09:00:00",
        "create_receivable": True,
        "idempotency_key": "idem-fixed-001",
    }
    first = client.post("/api/v1/cycles/intelligent", json=payload)
    assert first.status_code == 201, first.text
    cycle_id = first.json()["id"]

    receivables = client.get("/api/v1/receivables").json()
    assert len(receivables) == 1
    assert receivables[0]["amount_cents"] == 50000

    again = client.post("/api/v1/cycles/intelligent", json=payload)
    assert again.status_code == 201
    assert again.json()["id"] == cycle_id
    assert len(client.get("/api/v1/receivables").json()) == 1


# 12. Alteração futura do serviço não afeta ciclo histórico (snapshot)
def test_service_fixed_price_change_does_not_alter_historical_cycle(client, register_payload):
    ids = _setup_fixed_period_org(client, register_payload, fixed_price_cents=50000)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
        },
    )
    assert created.status_code == 201, created.text
    cycle_id = created.json()["id"]
    assert created.json()["value_cents"] == 50000

    patched = client.patch(
        f"/api/v1/services/{ids['service_id']}",
        json={"fixed_price_cents": 999900},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["fixed_price_cents"] == 999900

    reloaded = client.get(f"/api/v1/cycles/{cycle_id}")
    assert reloaded.status_code == 200
    assert reloaded.json()["value_cents"] == 50000
    assert reloaded.json()["pricing_mode"] == "fixed_period"


# Edição financeira pós-criação (desconto/valor final) sobre ciclo fixed_period
def test_fixed_period_financial_edit_recomposes_over_immutable_base(client, register_payload):
    ids = _setup_fixed_period_org(client, register_payload, fixed_price_cents=50000)
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
            "starts_time": "09:00:00",
        },
    )
    cycle_id = created.json()["id"]

    edited = client.patch(
        f"/api/v1/cycles/{cycle_id}/financial",
        json={"adjustment_cents": -10000},
    )
    assert edited.status_code == 200, edited.text
    body = edited.json()
    assert body["subtotal_cents"] == 50000  # immutable base, not multiplied/reset
    assert body["adjustment_cents"] == -10000
    assert body["value_cents"] == 40000


# 14. Isolamento multi-tenant
def test_fixed_period_service_isolated_between_organizations(client, register_payload):
    ids = _setup_fixed_period_org(client, register_payload, fixed_price_cents=50000)

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Outra Org Planos",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201

    assert client.get(f"/api/v1/services/{ids['service_id']}").status_code == 404


# 15. Serialização/validação: pricing_mode aparece nos payloads de saída
def test_service_and_cycle_serialize_pricing_mode(client, register_payload):
    ids = _setup_fixed_period_org(client, register_payload, fixed_price_cents=50000)
    service = client.get(f"/api/v1/services/{ids['service_id']}").json()
    assert service["pricing_mode"] == "fixed_period"
    assert service["fixed_price_cents"] == 50000

    preview = client.post(
        "/api/v1/cycles/preview",
        json={
            "service_id": ids["service_id"],
            "cycle_template_id": ids["template_id"],
            "starts_on": "2026-08-04",
            "weekdays": [1, 3],
        },
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["pricing_mode"] == "fixed_period"
    assert body["unit_price_cents"] is None
    assert body["subtotal_cents"] == 50000
