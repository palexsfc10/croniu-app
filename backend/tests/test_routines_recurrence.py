from datetime import date

from app.services import routines as routine_svc


def test_weekly_complete_advances_without_archiving(client, register_payload, db_session):
    client.post("/api/v1/auth/register", json=register_payload)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Revisar planos do mês",
            "task_type": "review_protocol",
            "recurrence": "weekly",
            "weekday": 1,
            "filter_json": {"weekdays": [1], "starts_on": "2026-08-17", "no_end": True},
        },
    )
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    first = created.json()["next_run_on"]
    done = client.post(f"/api/v1/routines/{rid}/complete")
    assert done.status_code == 200
    body = done.json()
    assert body["status"] == "active"
    assert body["next_run_on"] != first
    again = client.post(f"/api/v1/routines/{rid}/complete")
    assert again.json()["next_run_on"] != body["next_run_on"]
    listed = client.get("/api/v1/routines")
    rows = [row for row in listed.json() if row["id"] == rid]
    assert len(rows) == 1


def test_monthly_nth_and_once(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    monthly = client.post(
        "/api/v1/routines",
        json={
            "name": "Avaliação mensal",
            "task_type": "review_evaluation",
            "recurrence": "monthly",
            "weekday": 1,
            "filter_json": {
                "month_mode": "nth_weekday",
                "nth": 1,
                "nth_weekday": 1,
                "starts_on": "2026-09-01",
                "no_end": True,
            },
        },
    )
    assert monthly.status_code == 201, monthly.text
    preview = client.post(
        "/api/v1/routines/preview",
        json={
            "name": "x",
            "task_type": "free",
            "recurrence": "monthly",
            "weekday": 1,
            "filter_json": monthly.json()["filter_json"],
        },
    )
    assert preview.status_code == 200
    assert "terça" in preview.json()["preview"]
    once = client.post(
        "/api/v1/routines",
        json={
            "name": "Contato único",
            "task_type": "contact_client",
            "recurrence": "once",
            "filter_json": {"starts_on": "2026-09-10", "no_end": True},
        },
    )
    assert once.status_code == 201
    done = client.post(f"/api/v1/routines/{once.json()['id']}/complete")
    assert done.json()["status"] == "archived"
