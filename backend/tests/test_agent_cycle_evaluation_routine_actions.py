"""Cobertura final da IA: cancelar ciclo, publicar avaliação, cancelar rotina.

Testa os handlers diretamente (mesmo padrão de test_agent_occurrence_completion.py)
em vez de forçar o pipeline de chat completo — mais rápido e igualmente válido para
verificar contrato de confirmação, idempotência, isolamento de tenant e execução real.
"""

from __future__ import annotations

import uuid
from datetime import date

from app.agent.tools import TOOLS, WRITE_EXECUTORS, ToolContext, get_tool
from app.db import SessionLocal
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.client_evaluation import ClientEvaluation
from app.models.intake import RecurringClientTask
from app.services.auth import AuthError
from sqlalchemy import select
import pytest


def _auth(client, payload: dict) -> tuple[uuid.UUID, uuid.UUID]:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _ctx(db, org_id: uuid.UUID, user_id: uuid.UUID) -> ToolContext:
    return ToolContext(organization_id=org_id, user_id=user_id, db=db)


def _client_row(db, org_id: uuid.UUID, name: str) -> Client:
    row = Client(organization_id=org_id, full_name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _seed_cycle(client, key: str) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Cliente IA", "phone": "11988887777"}
    ).json()["id"]
    service_id = client.post(
        "/api/v1/services",
        json={"name": "Aula", "default_price_cents": 9000, "default_duration_minutes": 60},
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
    today = client.get("/api/v1/organization/preferences").json()["local_today"]
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": today,
            "weekdays": [0, 2],
            "starts_time": "09:00:00",
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    return {"client_id": client_id, "cycle_id": created.json()["id"]}


# ---------------------------------------------------------------------------
# propose_cancel_cycle / execute_cancel_cycle
# ---------------------------------------------------------------------------


def test_no_pause_or_complete_cycle_tool_exists():
    """Regra explícita: 'pausado' e 'concluído' não são estados suportados —
    nenhuma tool pode existir para eles, e nenhuma tool pode tocar o token do Portal."""
    names = set(TOOLS.keys()) | set(WRITE_EXECUTORS.keys())
    assert not any("pause" in n for n in names)
    assert not any("complete_cycle" in n or "cycle_completed" in n for n in names)
    assert not any("portal" in n or "public_access" in n for n in names)


def test_propose_cancel_cycle_summary_shows_real_consequences(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    ids = _seed_cycle(client, "ia-cancel-1")
    # One scheduled appointment already exists from the intelligent cycle creation.
    db = SessionLocal()
    try:
        proposal = get_tool("propose_cancel_cycle").handler(
            _ctx(db, org_id, user_id), {"cycle_id": ids["cycle_id"]}
        )
        assert proposal["needs_confirmation"] is True
        assert proposal["risk_class"] == "write_sensitive"
        assert proposal["summary_fields"]["Compromissos agendados a cancelar"] > 0
        assert "compromisso" in proposal["summary"].lower()
    finally:
        db.close()


def test_execute_cancel_cycle_matches_manual_cancel_endpoint_behavior(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    ids = _seed_cycle(client, "ia-cancel-2")
    db = SessionLocal()
    try:
        result = WRITE_EXECUTORS["cancel_cycle"](
            _ctx(db, org_id, user_id), {"cycle_id": ids["cycle_id"]}
        )
        assert result["status"] == "cancelled"
    finally:
        db.close()

    # Consistency check: the manual read endpoint sees the same real state.
    fetched = client.get(f"/api/v1/cycles/{ids['cycle_id']}")
    assert fetched.json()["status"] == "cancelled"
    db2 = SessionLocal()
    try:
        appts = db2.scalars(
            select(Appointment).where(Appointment.cycle_id == uuid.UUID(ids["cycle_id"]))
        ).all()
        assert appts, "expected the intelligent cycle to have generated appointments"
        for appt in appts:
            assert appt.status in {"cancelled", "completed", "no_show"}
    finally:
        db2.close()


def test_propose_cancel_cycle_idempotent_on_already_cancelled(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    ids = _seed_cycle(client, "ia-cancel-3")
    db = SessionLocal()
    try:
        WRITE_EXECUTORS["cancel_cycle"](_ctx(db, org_id, user_id), {"cycle_id": ids["cycle_id"]})
        second = get_tool("propose_cancel_cycle").handler(
            _ctx(db, org_id, user_id), {"cycle_id": ids["cycle_id"]}
        )
        assert second.get("code") == "already_cancelled"
        assert "needs_confirmation" not in second
    finally:
        db.close()


def test_cancel_cycle_rejects_nonexistent_and_cross_tenant(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    fake_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        with pytest.raises(AuthError):
            get_tool("propose_cancel_cycle").handler(
                _ctx(db, org_id, user_id), {"cycle_id": fake_id}
            )
    finally:
        db.close()

    ids = _seed_cycle(client, "ia-cancel-4")
    client.post("/api/v1/auth/logout")
    other = {
        "email": "ia_cancel_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio",
    }
    other_org, other_user = _auth(client, other)
    db = SessionLocal()
    try:
        with pytest.raises(AuthError):
            get_tool("propose_cancel_cycle").handler(
                _ctx(db, other_org, other_user), {"cycle_id": ids["cycle_id"]}
            )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# propose_publish_evaluation / execute_publish_evaluation
# ---------------------------------------------------------------------------


def test_propose_publish_evaluation_then_execute_and_consistency_with_manual_read(
    client, register_payload
):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        c = _client_row(db, org_id, "Cliente Avaliação IA")
        ev = ClientEvaluation(
            organization_id=org_id,
            client_id=c.id,
            author_user_id=user_id,
            title="Evolução de setembro",
            summary="Bom progresso",
            status="draft",
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)

        proposal = get_tool("propose_publish_evaluation").handler(
            _ctx(db, org_id, user_id), {"evaluation_id": str(ev.id)}
        )
        assert proposal["needs_confirmation"] is True
        assert "Cliente Avaliação IA" in proposal["summary"]

        result = WRITE_EXECUTORS["publish_evaluation"](
            _ctx(db, org_id, user_id), {"evaluation_id": str(ev.id)}
        )
        assert result["status"] == "published"
        ev_id = ev.id
        client_id = c.id
    finally:
        db.close()

    # Consistency check: the manual read endpoint sees the same real state.
    manual = client.get(f"/api/v1/clients/{client_id}/evaluations")
    assert manual.status_code == 200
    assert any(row["id"] == str(ev_id) and row["status"] == "published" for row in manual.json())

    db2 = SessionLocal()
    try:
        refreshed = db2.get(ClientEvaluation, ev_id)
        assert refreshed.status == "published"
        assert refreshed.published_at is not None
    finally:
        db2.close()


def test_publish_evaluation_idempotent_when_already_published(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        c = _client_row(db, org_id, "Cliente Ja Publicada")
        ev = ClientEvaluation(
            organization_id=org_id,
            client_id=c.id,
            author_user_id=user_id,
            title="Ja publicada",
            status="published",
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)

        result = get_tool("propose_publish_evaluation").handler(
            _ctx(db, org_id, user_id), {"evaluation_id": str(ev.id)}
        )
        assert result.get("code") == "already_published"
    finally:
        db.close()


def test_publish_evaluation_cross_tenant_rejected(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        c = _client_row(db, org_id, "Cliente Tenant A")
        ev = ClientEvaluation(
            organization_id=org_id,
            client_id=c.id,
            author_user_id=user_id,
            title="Rascunho A",
            status="draft",
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        ev_id = ev.id
    finally:
        db.close()

    client.post("/api/v1/auth/logout")
    other = {
        "email": "ia_eval_other@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro",
        "organization_name": "Outro Studio Eval",
    }
    other_org, other_user = _auth(client, other)
    db = SessionLocal()
    try:
        with pytest.raises(AuthError):
            get_tool("propose_publish_evaluation").handler(
                _ctx(db, other_org, other_user), {"evaluation_id": str(ev_id)}
            )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# propose_cancel_routine / execute_cancel_routine
# ---------------------------------------------------------------------------


def test_list_routines_resolves_name_to_id_for_cancel_routine(client, register_payload):
    """Real gap found in live HML validation: the AI can only cancel a routine it
    can resolve by name — without this read tool, propose_cancel_routine is unusable
    from natural language (the model correctly refused to guess an id without it)."""
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        c = _client_row(db, org_id, "Cliente Rotina")
        routine = RecurringClientTask(
            organization_id=org_id,
            name="Ligar para Bruna",
            task_type="contact_client",
            recurrence="once",
            status="active",
            filter_json={"client_id": str(c.id)},
        )
        db.add(routine)
        db.commit()
        db.refresh(routine)

        listed = get_tool("list_routines").handler(_ctx(db, org_id, user_id), {})
        match = next(r for r in listed["routines"] if r["name"] == "Ligar para Bruna")
        assert match["routine_id"] == str(routine.id)
        assert match["client_name"] == "Cliente Rotina"
    finally:
        db.close()


def test_propose_and_execute_cancel_routine(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        routine = RecurringClientTask(
            organization_id=org_id,
            name="Revisar plano semanal",
            task_type="review_protocol",
            recurrence="weekly",
            weekday=0,
            next_run_on=date(2026, 9, 7),
            status="active",
        )
        db.add(routine)
        db.commit()
        db.refresh(routine)

        proposal = get_tool("propose_cancel_routine").handler(
            _ctx(db, org_id, user_id), {"routine_id": str(routine.id)}
        )
        assert proposal["needs_confirmation"] is True
        assert "Revisar plano semanal" in proposal["summary"]

        result = WRITE_EXECUTORS["cancel_routine"](
            _ctx(db, org_id, user_id), {"routine_id": str(routine.id)}
        )
        assert result["status"] == "archived"
        routine_id = routine.id
    finally:
        db.close()

    db2 = SessionLocal()
    try:
        refreshed = db2.get(RecurringClientTask, routine_id)
        assert refreshed.status == "archived"
    finally:
        db2.close()


def test_cancel_routine_idempotent_when_already_archived(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    db = SessionLocal()
    try:
        routine = RecurringClientTask(
            organization_id=org_id,
            name="Rotina já arquivada",
            task_type="free",
            recurrence="once",
            status="archived",
        )
        db.add(routine)
        db.commit()
        db.refresh(routine)

        result = get_tool("propose_cancel_routine").handler(
            _ctx(db, org_id, user_id), {"routine_id": str(routine.id)}
        )
        assert result.get("code") == "already_archived"
    finally:
        db.close()
