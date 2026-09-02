"""Fatia 7 (Rotinas + Acompanhamentos) additions — all additive, zero
migration, zero schema change:
- GET /routines/board?include_completed=&include_cancelled= (extends the
  existing endpoint, backward compatible — old callers unaffected).
- GET /evaluations/recent (org-wide published-evaluations feed).
- GET /accompaniment/pending (real "clientes que precisam de acompanhamento"
  signal: active cycle + no evaluation, or evaluation older than N days).
- AI: propose_create_routine/execute_create_routine and
  list_clients_needing_accompaniment.
"""

from __future__ import annotations

from datetime import date, timedelta

import uuid

from app.agent.tools import ToolContext, execute_create_routine, get_tool


def _register(client, payload):
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _create_client(client, name="Aluna Teste", phone="11999990000"):
    res = client.post("/api/v1/clients", json={"full_name": name, "phone": phone})
    assert res.status_code == 201, res.text
    return res.json()


def _me(client) -> tuple[uuid.UUID, uuid.UUID]:
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _today(client) -> date:
    local_today = client.get("/api/v1/organization/preferences").json()["local_today"]
    y, m, d = (int(part) for part in local_today.split("-"))
    return date(y, m, d)


def _create_active_cycle(client, *, client_id, key, starts_time="09:00:00"):
    """An intelligent cycle that started a few days ago and hasn't ended —
    a real `status == "active"` cycle, not "upcoming"."""
    svc = client.post(
        "/api/v1/services",
        json={
            "name": "Aula",
            "default_duration_minutes": 60,
            "default_duration_days": 60,
            "default_price_cents": 9000,
        },
    )
    assert svc.status_code == 201, svc.text
    tpl = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "3x semana",
            "weekly_frequency": 3,
            "duration_type": "calendar_months",
            "duration_value": 2,
        },
    )
    assert tpl.status_code == 201, tpl.text
    starts_on = (_today(client) - timedelta(days=5)).isoformat()
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": svc.json()["id"],
            "cycle_template_id": tpl.json()["id"],
            "starts_on": starts_on,
            "weekdays": [0, 2, 4],
            "starts_time": starts_time,
            "generate_appointments": True,
            "create_receivable": False,
            "idempotency_key": key,
        },
    )
    assert cycle.status_code == 201, cycle.text
    return cycle.json()


# --- GET /routines/board?include_completed=&include_cancelled= ---------


def test_board_excludes_completed_and_cancelled_by_default(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    routine = client.post(
        "/api/v1/routines",
        json={
            "name": "Ligar para aluna",
            "task_type": "contact_client",
            "recurrence": "once",
            "next_run_on": today.isoformat(),
            "filter_json": {
                "trigger_type": "calendar",
                "audience": "this_client",
                "client_id": person["id"],
            },
        },
    )
    assert routine.status_code == 201, routine.text

    board = client.get("/api/v1/routines/board").json()
    occ_id = next(
        i["id"]
        for g in board["groups"]
        for i in g["items"]
        if i["client_id"] == person["id"]
    )
    decide = client.post(
        f"/api/v1/routines/occurrences/{occ_id}/decide", json={"status": "completed"}
    )
    assert decide.status_code == 200, decide.text

    default_board = client.get("/api/v1/routines/board").json()
    assert not any(
        i["id"] == occ_id for g in default_board["groups"] for i in g["items"]
    )

    completed_board = client.get("/api/v1/routines/board?include_completed=true").json()
    ids = [i["id"] for g in completed_board["groups"] for i in g["items"]]
    assert occ_id in ids
    item = next(i for g in completed_board["groups"] for i in g["items"] if i["id"] == occ_id)
    assert item["status"] == "completed"


def test_board_on_day_view_unaffected_by_new_flags(client, register_payload):
    """Agenda's `?on=` day view must keep its exact original behavior —
    the new flags only apply to the general board (Rotinas desktop)."""
    _register(client, register_payload)
    person = _create_client(client)
    today = _today(client)
    routine = client.post(
        "/api/v1/routines",
        json={
            "name": "Ligar para aluna",
            "task_type": "contact_client",
            "recurrence": "once",
            "next_run_on": today.isoformat(),
            "filter_json": {
                "trigger_type": "calendar",
                "audience": "this_client",
                "client_id": person["id"],
            },
        },
    )
    assert routine.status_code == 201, routine.text
    board = client.get("/api/v1/routines/board").json()
    occ_id = next(i["id"] for g in board["groups"] for i in g["items"])
    client.post(f"/api/v1/routines/occurrences/{occ_id}/decide", json={"status": "completed"})

    day_board = client.get(
        f"/api/v1/routines/board?on={today.isoformat()}&include_completed=true"
    ).json()
    ids = [i["id"] for g in day_board["groups"] for i in g["items"]]
    assert occ_id not in ids


# --- GET /evaluations/recent --------------------------------------------


def test_recent_evaluations_only_published_org_wide(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    draft = client.post(
        f"/api/v1/clients/{person['id']}/evaluations",
        json={"title": "Rascunho não deve aparecer"},
    )
    assert draft.status_code == 201, draft.text
    published = client.post(
        f"/api/v1/clients/{person['id']}/evaluations",
        json={"title": "Evolução publicada"},
    )
    assert published.status_code == 201, published.text
    pub = client.post(f"/api/v1/evaluations/{published.json()['id']}/publish")
    assert pub.status_code == 200, pub.text

    res = client.get("/api/v1/evaluations/recent")
    assert res.status_code == 200, res.text
    titles = [e["title"] for e in res.json()]
    assert "Evolução publicada" in titles
    assert "Rascunho não deve aparecer" not in titles


def test_recent_evaluations_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client)
    created = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Só da org A"}
    )
    assert created.status_code == 201, created.text
    client.post(f"/api/v1/evaluations/{created.json()['id']}/publish")

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "evalb_" + register_payload["email"],
        "organization_name": "Studio B Eval",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    res = client.get("/api/v1/evaluations/recent")
    assert res.status_code == 200
    assert res.json() == []


# --- GET /accompaniment/pending -----------------------------------------


def test_accompaniment_pending_flags_active_client_never_evaluated(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Nunca Avaliada")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-1")

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200, res.text
    body = res.json()
    row = next(r for r in body["items"] if r["client_id"] == person["id"])
    assert row["last_evaluation_at"] is None
    assert row["days_since_last_evaluation"] is None


def test_accompaniment_pending_excludes_recently_evaluated_client(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Avaliada Hoje", phone="11922221111")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-2", starts_time="10:00:00")
    created = client.post(
        f"/api/v1/clients/{person['id']}/evaluations", json={"title": "Evolução recente"}
    )
    assert created.status_code == 201, created.text
    pub = client.post(f"/api/v1/evaluations/{created.json()['id']}/publish")
    assert pub.status_code == 200, pub.text

    res = client.get("/api/v1/accompaniment/pending?days_threshold=15")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_ignores_client_without_active_cycle(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Sem Ciclo Ativo", phone="11933332222")

    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    ids = [r["client_id"] for r in res.json()["items"]]
    assert person["id"] not in ids


def test_accompaniment_pending_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Org A Cliente")
    _create_active_cycle(client, client_id=person["id"], key="acc-key-iso")

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "accb_" + register_payload["email"],
        "organization_name": "Studio B Acompanhamento",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    res = client.get("/api/v1/accompaniment/pending")
    assert res.status_code == 200
    assert res.json()["items"] == []


# --- AI: propose_create_routine / execute_create_routine ---------------


def test_propose_create_routine_summarizes_client_and_date(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Ana Cobranca")
    tomorrow = (_today(client) + timedelta(days=1)).isoformat()

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("propose_create_routine").handler(
            ctx,
            {
                "name": "Cobrar a Ana",
                "task_type": "check_payment",
                "due_on": tomorrow,
                "client_id": person["id"],
            },
        )
        assert result["needs_confirmation"] is True
        assert "Ana Cobranca" in result["summary"]
    finally:
        db.close()


def test_execute_create_routine_creates_real_client_scoped_occurrence(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Gabriel Rotina")
    tomorrow = (_today(client) + timedelta(days=1)).isoformat()

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = execute_create_routine(
            ctx,
            {
                "name": "Cobrar o Gabriel",
                "task_type": "check_payment",
                "due_on": tomorrow,
                "client_id": person["id"],
            },
        )
        assert result["kind"] == "routine"
        db.commit()
    finally:
        db.close()

    board = client.get("/api/v1/routines/board").json()
    items = [i for g in board["groups"] for i in g["items"] if i["client_id"] == person["id"]]
    assert any(i["due_on"] == tomorrow for i in items)


def test_create_routine_tool_isolated_by_tenant(client, register_payload):
    _register(client, register_payload)
    person = _create_client(client, name="Org A Cliente Rotina")
    tomorrow = (_today(client) + timedelta(days=1)).isoformat()

    client.cookies.clear()
    b_payload = {
        **register_payload,
        "email": "routineb_" + register_payload["email"],
        "organization_name": "Studio B Rotina",
        "full_name": "Pro B",
    }
    _register(client, b_payload)
    org_b_id, user_b_id = _me(client)

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_b_id, user_id=user_b_id, db=db)
        try:
            execute_create_routine(
                ctx,
                {
                    "name": "Cobrar cliente de outra org",
                    "task_type": "check_payment",
                    "due_on": tomorrow,
                    "client_id": person["id"],
                },
            )
            raised = False
        except Exception:
            raised = True
        assert raised
    finally:
        db.close()


# --- AI: list_clients_needing_accompaniment -----------------------------


def test_list_clients_needing_accompaniment_matches_rest_signal(client, register_payload):
    _register(client, register_payload)
    org_id, user_id = _me(client)
    person = _create_client(client, name="Precisa Acompanhamento")
    _create_active_cycle(client, client_id=person["id"], key="acc-ai-key")

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("list_clients_needing_accompaniment").handler(
            ctx, {"days_threshold": 15}
        )
        ids = [c["client_id"] for c in result["clients"]]
        assert person["id"] in ids
    finally:
        db.close()
