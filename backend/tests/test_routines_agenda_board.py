"""Routine definitions must materialize as operational occurrences for Agenda/Today."""
# ruff: noqa: E501

from __future__ import annotations

from datetime import date, timedelta


def test_weekly_routine_appears_on_board_and_does_not_duplicate(client, register_payload):
    auth = client.post("/api/v1/auth/register", json=register_payload)
    assert auth.status_code == 201, auth.text
    prefs = client.get("/api/v1/organization/preferences")
    today = date.fromisoformat(prefs.json()["local_today"])
    weekday = today.weekday()
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Revisar plano",
            "task_type": "review_protocol",
            "recurrence": "weekly",
            "weekday": weekday,
            "next_run_on": today.isoformat(),
            "filter_json": {"trigger_type": "calendar"},
        },
    )
    assert created.status_code == 201, created.text
    board = client.get(f"/api/v1/routines/board?on={today.isoformat()}")
    assert board.status_code == 200, board.text
    items = [i for g in board.json()["groups"] for i in g.get("items", [])]
    names = {i.get("name") for i in items}
    assert "Revisar plano" in names
    again = client.get(f"/api/v1/routines/board?on={today.isoformat()}")
    items2 = [i for g in again.json()["groups"] for i in g.get("items", [])]
    ids = [i["id"] for i in items2 if i.get("name") == "Revisar plano" and i.get("due_on") == today.isoformat()]
    assert len(ids) == 1
    occ_id = ids[0]
    decide = client.post(
        f"/api/v1/routines/occurrences/{occ_id}/decide",
        json={"status": "completed"},
    )
    assert decide.status_code == 200, decide.text
    routine = client.get("/api/v1/routines").json()[0]
    assert routine["status"] == "active"
    assert routine["next_run_on"] != today.isoformat()


def test_overdue_routine_appears_on_today_board(client, register_payload):
    auth = client.post("/api/v1/auth/register", json=register_payload)
    assert auth.status_code == 201
    prefs = client.get("/api/v1/organization/preferences")
    today = date.fromisoformat(prefs.json()["local_today"])
    past = today - timedelta(days=3)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Pedir feedback",
            "task_type": "send_feedback",
            "recurrence": "weekly",
            "weekday": past.weekday(),
            "next_run_on": past.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    board = client.get(f"/api/v1/routines/board?on={today.isoformat()}")
    items = [i for g in board.json()["groups"] for i in g.get("items", [])]
    match = next(i for i in items if i.get("name") == "Pedir feedback")
    assert match["overdue"] is True
    defer = client.post(
        f"/api/v1/routines/occurrences/{match['id']}/decide",
        json={"status": "deferred", "deferred_until": (today + timedelta(days=1)).isoformat()},
    )
    assert defer.status_code == 200
    today_board = client.get(f"/api/v1/routines/board?on={today.isoformat()}")
    today_items = [i for g in today_board.json()["groups"] for i in g.get("items", [])]
    assert all(i.get("id") != match["id"] for i in today_items)


def test_agenda_day_materializes_without_opening_routines_board(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    prefs = client.get("/api/v1/organization/preferences")
    today = date.fromisoformat(prefs.json()["local_today"])
    client.post(
        "/api/v1/routines",
        json={
            "name": "Revisar plano",
            "task_type": "review_protocol",
            "recurrence": "weekly",
            "weekday": today.weekday(),
            "next_run_on": today.isoformat(),
            "filter_json": {"trigger_type": "calendar"},
        },
    )
    agenda = client.get(f"/api/v1/agenda/day?day={today.isoformat()}")
    assert agenda.status_code == 200
    home = client.get("/api/v1/home/summary")
    assert home.status_code == 200
    assert home.json()["routines_due_today_count"] >= 1


def test_client_lifecycle_trigger_rejected(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    res = client.post(
        "/api/v1/routines",
        json={
            "name": "Ausência",
            "task_type": "contact_client",
            "recurrence": "weekly",
            "weekday": 1,
            "filter_json": {"trigger_type": "client_lifecycle"},
        },
    )
    assert res.status_code == 422


def test_cycle_lifecycle_prepares_renewal(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    prefs = client.get("/api/v1/organization/preferences")
    today = date.fromisoformat(prefs.json()["local_today"])
    cid = client.post("/api/v1/clients", json={"full_name": "Ana", "phone": "11911112222"}).json()["id"]
    svc = client.post(
        "/api/v1/services",
        json={"name": "Aula", "default_duration_minutes": 60, "default_duration_days": 30, "default_price_cents": 9000},
    ).json()
    tpl = client.post(
        "/api/v1/cycle-templates",
        json={"name": "Mensal", "weekly_frequency": 1, "duration_type": "calendar_months", "duration_value": 1},
    ).json()
    cycle = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": cid,
            "service_id": svc["id"],
            "cycle_template_id": tpl["id"],
            "starts_on": today.isoformat(),
            "weekdays": [today.weekday()],
            "starts_time": "09:00:00",
            "generate_appointments": True,
            "create_receivable": False,
            "idempotency_key": "life-cycle-1",
        },
    )
    assert cycle.status_code == 201, cycle.text
    ends = date.fromisoformat(cycle.json()["ends_on"])
    due = ends - timedelta(days=7)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Preparar renovação",
            "task_type": "prepare_renewal",
            "recurrence": "once",
            "filter_json": {
                "trigger_type": "cycle_lifecycle",
                "anchor": "ends_on",
                "offset_days": 7,
            },
        },
    )
    assert created.status_code == 201, created.text
    client.get(f"/api/v1/agenda/day?day={due.isoformat()}")
    board = client.get(f"/api/v1/routines/board?on={due.isoformat()}")
    items = [i for g in board.json()["groups"] for i in g.get("items", [])]
    assert any(i.get("name") == "Preparar renovação" for i in items)


def test_concurrent_ensure_does_not_duplicate(client, register_payload):
    from concurrent.futures import ThreadPoolExecutor
    from uuid import UUID

    from app.models.intake import OperationalOccurrence
    from app.services import routine_occurrences as occ_svc
    from sqlalchemy import select
    from tests.conftest import TestingSessionLocal

    auth = client.post("/api/v1/auth/register", json=register_payload).json()
    org_id = UUID(auth["organization"]["id"])
    prefs = client.get("/api/v1/organization/preferences")
    today = date.fromisoformat(prefs.json()["local_today"])
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Revisar plano",
            "task_type": "review_protocol",
            "recurrence": "weekly",
            "weekday": today.weekday(),
            "next_run_on": today.isoformat(),
        },
    )
    assert created.status_code == 201

    def run(_i: int) -> None:
        db = TestingSessionLocal()
        try:
            occ_svc.persist_for_day(db, organization_id=org_id, day=today)
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(run, range(2)))
    db = TestingSessionLocal()
    try:
        rows = list(
            db.scalars(
                select(OperationalOccurrence).where(
                    OperationalOccurrence.organization_id == org_id,
                    OperationalOccurrence.source == "routine",
                )
            ).all()
        )
        keys = [r.idempotency_key for r in rows if r.due_on == today]
        assert len(keys) == len(set(keys))
        assert len(keys) >= 1
    finally:
        db.close()
    board = client.get(f"/api/v1/routines/board?on={today.isoformat()}")
    assert board.status_code == 200

