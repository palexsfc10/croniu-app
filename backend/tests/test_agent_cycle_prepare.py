"""Deterministic cycle preparation for the assistant."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from app.agent import cycle_prepare as prep
from app.agent.tools import ToolContext, get_tool
from app.db import SessionLocal
from fastapi.testclient import TestClient


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _me(client: TestClient) -> tuple[UUID, UUID]:
    me = client.get("/api/v1/auth/me").json()
    return UUID(me["organization"]["id"]), UUID(me["user"]["id"])


def _seed_fixed_period(client: TestClient) -> dict:
    c = client.post(
        "/api/v1/clients",
        json={"full_name": "Maria Souza", "phone": "11977776666"},
    )
    assert c.status_code == 201, c.text
    s = client.post(
        "/api/v1/services",
        json={
            "name": "Plano mensal",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": 0,
            "pricing_mode": "fixed_period",
            "fixed_price_cents": 30000,
        },
    )
    assert s.status_code == 201, s.text
    t = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Plano mensal",
            "weekly_frequency": 2,
            "duration_type": "fixed_days",
            "duration_value": 30,
        },
    )
    assert t.status_code == 201, t.text
    return {
        "client_id": c.json()["id"],
        "service_id": s.json()["id"],
        "template_id": t.json()["id"],
    }


def _seed_aula_padrao(client: TestClient) -> dict:
    c = client.post(
        "/api/v1/clients",
        json={"full_name": "José da Silva", "phone": "11988887777"},
    )
    assert c.status_code == 201, c.text
    s = client.post(
        "/api/v1/services",
        json={
            "name": "Aula padrão",
            "default_duration_minutes": 60,
            "default_duration_days": 30,
            "default_price_cents": 30000,
        },
    )
    assert s.status_code == 201, s.text
    t = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Aula padrão",
            "weekly_frequency": 2,
            "duration_type": "fixed_days",
            "duration_value": 30,
        },
    )
    assert t.status_code == 201, t.text
    return {
        "client_id": c.json()["id"],
        "service_id": s.json()["id"],
        "template_id": t.json()["id"],
    }


def test_estimate_and_ends_on_match_fixed_days_rule():
    starts = date(2026, 8, 7)
    ends = prep.compute_ends_on(
        starts_on=starts, duration_type="fixed_days", duration_value=30
    )
    assert ends == date(2026, 9, 6)  # exclusive renewal
    planned = prep.estimate_planned_sessions(
        weekly_frequency=2, duration_days=(ends - starts).days
    )
    assert planned == 8


def test_prepare_asks_only_start_date_when_defaults_complete(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_or_template_name="Aula padrão",
            weekly_frequency=2,
            today=date(2026, 8, 7),
        )
        assert result.status == "need_input"
        assert result.payload["missing"] == ["starts_on"]
        assert "Quando começa" in result.payload["message"]
        assert "Encontrei Aula padrão" in result.payload["message"]
        assert "2 vezes por semana" in result.payload["message"] or "2" in result.payload["message"]
        # Must not ask for value/frequency again
        assert "Qual o valor" not in result.payload["message"]
        assert "Quantas aulas" not in result.payload["message"]
    finally:
        db.close()


def test_prepare_ready_with_structured_frequency(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        # Without schedule → asks for days/times
        pending = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_or_template_name="Aula padrão",
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            today=date(2026, 8, 7),
        )
        assert pending.status == "need_input"
        assert "weekdays" in pending.payload["missing"]
        assert "dias" in pending.payload["message"].lower()

        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_or_template_name="Aula padrão",
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            weekdays=[1, 3],
            starts_time="19:00",
            today=date(2026, 8, 7),
        )
        assert result.status == "ready"
        draft = result.payload["draft"]
        assert draft["weekly_frequency"] == 2
        assert draft["planned_sessions"] == 8
        assert draft["lesson_count"] == 8
        assert draft["value_cents"] == 30000
        assert draft["creates_appointments"] is True
        assert draft["generate_appointments"] is True
        assert draft["starts_on"] == "2026-08-07"
        assert draft["ends_on"] == "2026-09-06"
        assert "8 compromissos" in draft["summary_lines"]["Agenda"]
        assert "Sem compromissos" not in draft["summary_lines"]["Agenda"]
    finally:
        db.close()


def test_prepare_ambiguous_clients(client, register_payload):
    _auth(client, register_payload)
    assert client.post(
        "/api/v1/clients", json={"full_name": "Ana Souza", "phone": "11911110001"}
    ).status_code == 201
    assert client.post(
        "/api/v1/clients", json={"full_name": "Ana Silva", "phone": "11911110002"}
    ).status_code == 201
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_name="Ana",
            service_or_template_name="X",
            today=date(2026, 8, 7),
        )
        assert result.status == "need_clarification"
        assert result.payload["missing"] == ["client"]
        assert len(result.payload["candidates"]) >= 2
    finally:
        db.close()


def test_prepare_service_not_found(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_or_template_name="Serviço inexistente XYZ",
            today=date(2026, 8, 7),
        )
        assert result.status == "need_clarification"
        assert "service" in result.payload["missing"]
    finally:
        db.close()


def test_prepare_missing_frequency_asks(client, register_payload):
    _auth(client, register_payload)
    c = client.post(
        "/api/v1/clients", json={"full_name": "Bia", "phone": "11922223333"}
    )
    s = client.post(
        "/api/v1/services",
        json={
            "name": "Só preço",
            "default_duration_days": 30,
            "default_price_cents": 10000,
            "default_duration_minutes": 50,
        },
    )
    assert c.status_code == 201 and s.status_code == 201
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(c.json()["id"]),
            service_id=UUID(s.json()["id"]),
            starts_on=date(2026, 8, 7),
            today=date(2026, 8, 7),
        )
        assert result.status == "need_input"
        assert "weekly_frequency" in result.payload["missing"]
    finally:
        db.close()


def test_prepare_missing_value_asks(client, register_payload):
    _auth(client, register_payload)
    c = client.post(
        "/api/v1/clients", json={"full_name": "Cia", "phone": "11933334444"}
    )
    s = client.post(
        "/api/v1/services",
        json={"name": "Sem preço", "default_duration_days": 30, "default_duration_minutes": 50},
    )
    t = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "Sem preço",
            "weekly_frequency": 2,
            "duration_type": "fixed_days",
            "duration_value": 30,
        },
    )
    assert c.status_code == 201 and s.status_code == 201 and t.status_code == 201
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(c.json()["id"]),
            service_id=UUID(s.json()["id"]),
            starts_on=date(2026, 8, 7),
            today=date(2026, 8, 7),
        )
        assert result.status == "need_input"
        assert "value_cents" in result.payload["missing"]
    finally:
        db.close()


def test_prepare_active_cycle_conflict(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    created = client.post(
        "/api/v1/cycles",
        json={
            "client_id": ids["client_id"],
            "service_id": ids["service_id"],
            "starts_on": "2026-08-01",
            "ends_on": "2026-08-20",
            "value_cents": 30000,
            "create_receivable": False,
        },
    )
    assert created.status_code == 201, created.text
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_or_template_name="Aula padrão",
            starts_on=date(2026, 8, 7),
            weekly_frequency=2,
            today=date(2026, 8, 7),
        )
        assert result.status == "conflict"
        assert "ciclo ativo" in result.payload["message"].lower()
        assert result.payload["suggested_starts_on"] == "2026-08-21"
    finally:
        db.close()


def test_prepare_renewal_after_active_end(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    assert (
        client.post(
            "/api/v1/cycles",
            json={
                "client_id": ids["client_id"],
                "service_id": ids["service_id"],
                "starts_on": "2026-08-01",
                "ends_on": "2026-08-20",
                "value_cents": 30000,
                "create_receivable": False,
            },
        ).status_code
        == 201
    )
    org_id, _ = _me(client)
    db = SessionLocal()
    try:
        result = prep.prepare_cycle_proposal(
            db,
            organization_id=org_id,
            client_id=UUID(ids["client_id"]),
            service_or_template_name="Aula padrão",
            starts_on=date(2026, 8, 21),
            weekly_frequency=2,
            weekdays=[1, 3],
            starts_time="19:00",
            today=date(2026, 8, 7),
        )
        assert result.status == "ready"
        assert result.payload["draft"]["starts_on"] == "2026-08-21"
    finally:
        db.close()


def test_propose_create_cycle_card_and_execute_structured(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(
            organization_id=org_id,
            user_id=user_id,
            db=db,
            today=date(2026, 8, 7),
        )
        propose = get_tool("propose_create_cycle").handler(
            ctx,
            {
                "client_id": ids["client_id"],
                "service_id": ids["service_id"],
                "starts_on": "2026-08-07",
                "ends_on": "2026-09-06",
                "value_cents": 30000,
                "weekly_frequency": 2,
                "lesson_count": 8,
                "duration_type": "fixed_days",
                "duration_value": 30,
                "cycle_template_id": ids["template_id"],
                "create_receivable": True,
                "receivable_due_on": "2026-08-07",
                "weekdays": [1, 3],
                "starts_time": "19:00",
                "generate_appointments": True,
                "idempotency_key": "propose-exec-sched-1",
            },
        )
        assert propose["needs_confirmation"] is True
        fields = propose["summary_fields"]
        assert fields["Cliente"] == "José da Silva"
        assert fields["Serviço"] == "Aula padrão"
        assert "Frequência" in fields
        assert "2" in fields["Frequência"]
        assert "compromissos serão criados" in fields["Agenda"]
        assert propose["arguments"]["weekly_frequency"] == 2
        assert propose["arguments"]["generate_appointments"] is True
        assert "duas vezes" not in (propose["arguments"].get("notes") or "").lower()

        from app.agent.tools import execute_create_cycle

        out = execute_create_cycle(ctx, propose["arguments"])
        assert out["kind"] == "cycle"
        assert out["weekly_frequency"] == 2
        assert out["lesson_count"] == 8
        assert out["creates_appointments"] is True
        assert out["appointment_count"] == 8

        cycle = client.get(f"/api/v1/cycles/{out['id']}").json()
        assert cycle["weekly_frequency"] == 2
        assert cycle["lesson_count"] == 8
        assert cycle["value_cents"] == 30000
        assert cycle["is_legacy"] is False

        # Verify appointments via DB (list endpoints vary)
        from sqlalchemy import select
        from app.models.appointment import Appointment

        linked = list(
            db.scalars(
                select(Appointment).where(
                    Appointment.organization_id == org_id,
                    Appointment.cycle_id == UUID(out["id"]),
                )
            ).all()
        )
        assert len(linked) == 8
    finally:
        db.close()


def test_propose_create_cycle_fixed_period_shows_valor_do_plano_label(
    client, register_payload
):
    _auth(client, register_payload)
    ids = _seed_fixed_period(client)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(
            organization_id=org_id,
            user_id=user_id,
            db=db,
            today=date(2026, 8, 7),
        )
        propose = get_tool("propose_create_cycle").handler(
            ctx,
            {
                "client_id": ids["client_id"],
                "service_id": ids["service_id"],
                "starts_on": "2026-08-07",
                "ends_on": "2026-09-06",
                "value_cents": 30000,
                "weekly_frequency": 2,
                "lesson_count": 8,
                "duration_type": "fixed_days",
                "duration_value": 30,
                "cycle_template_id": ids["template_id"],
                "create_receivable": True,
                "receivable_due_on": "2026-08-07",
                "weekdays": [1, 3],
                "starts_time": "19:00",
                "generate_appointments": True,
                "idempotency_key": "propose-fixed-period-label",
            },
        )
        assert propose["needs_confirmation"] is True
        fields = propose["summary_fields"]
        # AI-002: a fixed_period service sells a flat plan value, independent of
        # lesson count — the confirmation summary must label it "Valor do plano",
        # matching the wording already used by cycle_prepare.py's own preview.
        assert fields["Valor do plano"] == "R$ 300,00"
        assert "Valor" not in fields

        # No mutation happened yet — propose_create_cycle only ever returns a
        # proposal; the cycle must not exist until execute_create_cycle runs.
        from sqlalchemy import select

        from app.models.cycle import Cycle

        assert (
            db.scalar(select(Cycle).where(Cycle.organization_id == org_id)) is None
        )
    finally:
        db.close()


def test_propose_create_cycle_per_lesson_keeps_valor_label(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(
            organization_id=org_id,
            user_id=user_id,
            db=db,
            today=date(2026, 8, 7),
        )
        propose = get_tool("propose_create_cycle").handler(
            ctx,
            {
                "client_id": ids["client_id"],
                "service_id": ids["service_id"],
                "starts_on": "2026-08-07",
                "ends_on": "2026-09-06",
                "value_cents": 30000,
                "weekly_frequency": 2,
                "lesson_count": 8,
                "duration_type": "fixed_days",
                "duration_value": 30,
                "cycle_template_id": ids["template_id"],
                "create_receivable": True,
                "receivable_due_on": "2026-08-07",
                "weekdays": [1, 3],
                "starts_time": "19:00",
                "generate_appointments": True,
                "idempotency_key": "propose-per-lesson-label",
            },
        )
        assert propose["needs_confirmation"] is True
        fields = propose["summary_fields"]
        # per_lesson behavior must stay exactly as before this fix.
        assert fields["Valor"] == "R$ 300,00"
        assert "Valor do plano" not in fields

        from sqlalchemy import select

        from app.models.cycle import Cycle

        assert (
            db.scalar(select(Cycle).where(Cycle.organization_id == org_id)) is None
        )
    finally:
        db.close()


def test_prepare_tool_same_pipeline(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(
            organization_id=org_id, user_id=user_id, db=db, today=date(2026, 8, 7)
        )
        out = get_tool("prepare_cycle_proposal").handler(
            ctx,
            {
                "client_name": "José da Silva",
                "service_or_template_name": "Aula padrão",
                "weekly_frequency": 2,
            },
        )
        assert out["status"] == "need_input"
        assert out["missing"] == ["starts_on"]
    finally:
        db.close()


def test_find_services_exact_and_ambiguous(client, register_payload):
    _auth(client, register_payload)
    assert (
        client.post(
            "/api/v1/services",
            json={"name": "Aula padrão", "default_price_cents": 30000, "default_duration_minutes": 60},
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/services",
            json={"name": "Aula premium", "default_price_cents": 50000, "default_duration_minutes": 60},
        ).status_code
        == 201
    )
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        exact = get_tool("find_services").handler(ctx, {"name_query": "Aula padrão"})
        assert exact["found"] is True
        assert exact["service"]["name"] == "Aula padrão"

        amb = get_tool("find_services").handler(ctx, {"name_query": "Aula"})
        assert amb.get("ambiguous") is True or len(amb.get("services") or []) >= 2

        miss = get_tool("find_services").handler(ctx, {"name_query": "Natação espacial"})
        assert miss["found"] is False
    finally:
        db.close()


def test_cross_tenant_prepare_cannot_see_other_client(client, register_payload):
    _auth(client, register_payload)
    ids = _seed_aula_padrao(client)
    victim_client = ids["client_id"]

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Org Cycle B",
    }
    client.cookies.clear()
    _auth(client, other)
    org_b, _ = _me(client)
    db = SessionLocal()
    try:
        from app.services.auth import AuthError

        try:
            prep.prepare_cycle_proposal(
                db,
                organization_id=org_b,
                client_id=UUID(victim_client),
                service_or_template_name="Aula padrão",
                starts_on=date(2026, 8, 7),
                weekly_frequency=2,
                today=date(2026, 8, 7),
            )
            raise AssertionError("expected AuthError for cross-tenant client")
        except AuthError as exc:
            assert exc.code in {"not_found", "forbidden"} or exc.status_code == 404
    finally:
        db.close()
