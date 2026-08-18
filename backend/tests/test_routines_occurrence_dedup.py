"""Reproduces and locks the routine-occurrence duplication root causes.

See docs/sprints/DIAGNOSIS_ROUTINES_DUPLICATION.md.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.models.intake import OperationalOccurrence
from app.services import routine_occurrences as occ_svc
from sqlalchemy import select
from tests.conftest import TestingSessionLocal


def _today(client) -> date:
    prefs = client.get("/api/v1/organization/preferences")
    return date.fromisoformat(prefs.json()["local_today"])


def _org_id(client, register_payload) -> str:
    auth = client.post("/api/v1/auth/register", json=register_payload)
    assert auth.status_code == 201, auth.text
    return auth.json()["organization"]["id"]


def _rows_for_routine(org_id: str, routine_id: str) -> list[OperationalOccurrence]:
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
        return [r for r in rows if (r.meta or {}).get("routine_id") == routine_id]
    finally:
        db.close()


def test_once_routine_does_not_flood_the_lazy_window(client, register_payload):
    """Root cause A: a "once" routine with no explicit starts_on used to emit
    one occurrence per day of the 15-day lazy-materialization window every
    time the board was read. It must emit exactly one, ever."""
    org_id = _org_id(client, register_payload)
    today = _today(client)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Conferir acompanhamento",
            "task_type": "contact_client",
            "recurrence": "once",
        },
    )
    assert created.status_code == 201, created.text
    routine_id = created.json()["id"]

    # Reading the board (which materializes today-14..today+1) repeatedly,
    # and across several simulated days, must never grow past one occurrence.
    for _ in range(3):
        board = client.get("/api/v1/routines/board")
        assert board.status_code == 200, board.text
    rows = _rows_for_routine(org_id, routine_id)
    assert len(rows) == 1, [r.due_on.isoformat() for r in rows]

    for offset in range(1, 5):
        db = TestingSessionLocal()
        try:
            from uuid import UUID

            occ_svc.persist_for_day(
                db, organization_id=UUID(org_id), day=today + timedelta(days=offset)
            )
        finally:
            db.close()
    rows_after = _rows_for_routine(org_id, routine_id)
    assert len(rows_after) == 1, [r.due_on.isoformat() for r in rows_after]


def test_once_routine_completed_never_reappears(client, register_payload):
    org_id = _org_id(client, register_payload)
    created = client.post(
        "/api/v1/routines",
        json={"name": "Conferir once", "task_type": "contact_client", "recurrence": "once"},
    )
    routine_id = created.json()["id"]
    board = client.get("/api/v1/routines/board")
    items = [i for g in board.json()["groups"] for i in g.get("items", [])]
    occ = next(i for i in items if i.get("routine_id") == routine_id)
    decide = client.post(
        f"/api/v1/routines/occurrences/{occ['id']}/decide", json={"status": "completed"}
    )
    assert decide.status_code == 200, decide.text

    for _ in range(3):
        client.get("/api/v1/routines/board")
    rows = _rows_for_routine(org_id, routine_id)
    assert len(rows) == 1
    assert rows[0].status == "completed"


def test_overdue_recurring_routine_stays_a_single_open_occurrence(client, register_payload):
    """Root cause C: an unresolved weekly routine must not pile up one open
    row per missed period — it stays the same open occurrence, reclassified
    as overdue purely by comparing due_on to today."""
    org_id = _org_id(client, register_payload)
    today = _today(client)
    far_past = today - timedelta(days=35)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Pedir feedback",
            "task_type": "send_feedback",
            "recurrence": "weekly",
            "weekday": far_past.weekday(),
            "next_run_on": far_past.isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    routine_id = created.json()["id"]
    client.get("/api/v1/routines/board")
    rows = _rows_for_routine(org_id, routine_id)
    open_rows = [r for r in rows if r.status == "open"]
    assert len(open_rows) == 1, [r.due_on.isoformat() for r in open_rows]


def test_calendar_routine_fans_out_per_active_client(client, register_payload):
    """Root cause B: a per-student routine (audience=all_active) must
    materialize one occurrence per active client, not a single client_id=None
    occurrence."""
    org_id = _org_id(client, register_payload)
    c1 = client.post("/api/v1/clients", json={"full_name": "Ana", "phone": "11911110001"}).json()
    c2 = client.post("/api/v1/clients", json={"full_name": "Bia", "phone": "11911110002"}).json()
    c3 = client.post("/api/v1/clients", json={"full_name": "Carla", "phone": "11911110003"}).json()
    archive = client.patch(f"/api/v1/clients/{c3['id']}", json={"status": "archived"})
    assert archive.status_code == 200, archive.text

    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Revisar plano",
            "task_type": "review_protocol",
            "recurrence": "monthly",
            "filter_json": {"trigger_type": "calendar", "audience": "all_active"},
        },
    )
    assert created.status_code == 201, created.text
    routine_id = created.json()["id"]

    board = client.get("/api/v1/routines/board")
    items = [
        i
        for g in board.json()["groups"]
        for i in g.get("items", [])
        if i.get("routine_id") == routine_id
    ]
    client_ids = {i["client_id"] for i in items}
    assert client_ids == {c1["id"], c2["id"]}
    assert None not in client_ids

    # Re-reading must not duplicate per client.
    client.get("/api/v1/routines/board")
    client.get("/api/v1/routines/board")
    rows = _rows_for_routine(org_id, routine_id)
    assert len(rows) == 2
    assert len({r.client_id for r in rows}) == 2


def test_calendar_routine_completing_one_client_does_not_affect_another(client, register_payload):
    _org_id(client, register_payload)
    c1 = client.post("/api/v1/clients", json={"full_name": "Ana", "phone": "11911110011"}).json()
    c2 = client.post("/api/v1/clients", json={"full_name": "Bia", "phone": "11911110012"}).json()
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Realizar avaliação",
            "task_type": "review_evaluation",
            "recurrence": "weekly",
            "filter_json": {"trigger_type": "calendar", "audience": "all_active"},
        },
    )
    routine_id = created.json()["id"]
    board = client.get("/api/v1/routines/board")
    items = [
        i
        for g in board.json()["groups"]
        for i in g.get("items", [])
        if i.get("routine_id") == routine_id
    ]
    occ_ana = next(i for i in items if i["client_id"] == c1["id"])
    decide = client.post(
        f"/api/v1/routines/occurrences/{occ_ana['id']}/decide", json={"status": "completed"}
    )
    assert decide.status_code == 200

    board2 = client.get("/api/v1/routines/board")
    items2 = [
        i
        for g in board2.json()["groups"]
        for i in g.get("items", [])
        if i.get("routine_id") == routine_id
    ]
    remaining_clients = {i["client_id"] for i in items2}
    assert remaining_clients == {c2["id"]}


def test_calendar_routine_without_audience_stays_general_single_occurrence(
    client, register_payload
):
    """Backward compatibility: legacy routines with no explicit audience keep
    behaving as a single org-wide occurrence (unchanged from before)."""
    org_id = _org_id(client, register_payload)
    client.post("/api/v1/clients", json={"full_name": "Ana", "phone": "11911110099"})
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Tarefa geral",
            "task_type": "free",
            "recurrence": "weekly",
            "filter_json": {"trigger_type": "calendar"},
        },
    )
    routine_id = created.json()["id"]
    client.get("/api/v1/routines/board")
    rows = _rows_for_routine(org_id, routine_id)
    assert len(rows) == 1
    assert rows[0].client_id is None


def test_invalid_audience_selected_without_client_ids_rejected(client, register_payload):
    _org_id(client, register_payload)
    res = client.post(
        "/api/v1/routines",
        json={
            "name": "Rotina inválida",
            "task_type": "free",
            "recurrence": "weekly",
            "filter_json": {"trigger_type": "calendar", "audience": "selected"},
        },
    )
    assert res.status_code == 422
