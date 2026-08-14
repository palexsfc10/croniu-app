"""Routine definitions must materialize as operational occurrences for Agenda/Today."""

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
    ids = [i["id"] for i in items2 if i.get("name") == "Revisar plano"]
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
    assert all(i.get("name") != "Pedir feedback" for i in today_items)
