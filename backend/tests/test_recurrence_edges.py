from datetime import date
from concurrent.futures import ThreadPoolExecutor

from app.services.recurrence import next_after, nth_weekday


def test_month_end_days_and_february():
    spec31 = {"month_mode": "dom", "month_day": 31, "starts_on": "2026-01-31", "no_end": True}
    feb = next_after("monthly", spec31, weekday=None, after=date(2026, 1, 31))
    assert feb == date(2026, 1, 31)
    mar = next_after("monthly", spec31, weekday=None, after=date(2026, 2, 1))
    assert mar.day == 28 and mar.month == 2
    leap = next_after(
        "monthly",
        {"month_mode": "dom", "month_day": 29, "starts_on": "2024-01-29", "no_end": True},
        weekday=None,
        after=date(2024, 1, 30),
    )
    assert leap == date(2024, 2, 29)
    non_leap = next_after(
        "monthly",
        {"month_mode": "dom", "month_day": 29, "starts_on": "2025-01-29", "no_end": True},
        weekday=None,
        after=date(2025, 1, 30),
    )
    assert non_leap == date(2025, 2, 28)
    day30 = next_after(
        "monthly",
        {"month_mode": "dom", "month_day": 30, "starts_on": "2026-01-30", "no_end": True},
        weekday=None,
        after=date(2026, 2, 1),
    )
    assert day30 == date(2026, 2, 28)


def test_last_monday_and_missing_fifth():
    last_mon = nth_weekday(2026, 2, 0, -1)
    assert last_mon == date(2026, 2, 23)
    assert nth_weekday(2026, 2, 0, 5) is None
    nxt = next_after(
        "monthly",
        {
            "month_mode": "nth_weekday",
            "nth": 5,
            "nth_weekday": 0,
            "starts_on": "2026-02-01",
            "no_end": True,
        },
        weekday=0,
        after=date(2026, 2, 1),
    )
    assert nxt is not None
    assert nxt.weekday() == 0
    assert nth_weekday(nxt.year, nxt.month, 0, 5) == nxt


def test_no_end_and_sao_paulo_create(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    prefs = client.get("/api/v1/organization/preferences")
    assert prefs.status_code == 200
    assert prefs.json()["timezone"] == "America/Sao_Paulo"
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Sem término",
            "task_type": "review_cycle",
            "recurrence": "weekly",
            "weekday": 1,
            "filter_json": {"weekdays": [1], "starts_on": "2026-08-18", "no_end": True},
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["filter_json"]["no_end"] is True
    assert body["next_run_on"] is not None
    assert "last_occurrence_completed" not in (body["filter_json"] or {})


def test_rule_edit_and_idempotent_complete(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Semanal",
            "task_type": "review_protocol",
            "recurrence": "weekly",
            "weekday": 1,
            "filter_json": {"weekdays": [1], "starts_on": "2026-08-18", "no_end": True},
        },
    )
    rid = created.json()["id"]
    occ = created.json()["next_run_on"]
    patched = client.patch(
        f"/api/v1/routines/{rid}",
        json={"recurrence": "biweekly", "filter_json": {"weekdays": [1], "starts_on": "2026-08-18", "no_end": True}, "recompute": True},
    )
    assert patched.status_code == 200
    first = client.post(f"/api/v1/routines/{rid}/complete", params={"occurrence_on": occ})
    second = client.post(f"/api/v1/routines/{rid}/complete", params={"occurrence_on": occ})
    assert first.json()["next_run_on"] == second.json()["next_run_on"]
    listed = client.get("/api/v1/routines")
    assert len([r for r in listed.json() if r["id"] == rid]) == 1


def test_concurrent_complete_same_occurrence(client, register_payload):
    client.post("/api/v1/auth/register", json=register_payload)
    created = client.post(
        "/api/v1/routines",
        json={
            "name": "Concorrente",
            "task_type": "contact_client",
            "recurrence": "weekly",
            "weekday": 1,
            "filter_json": {"weekdays": [1], "starts_on": "2026-08-18", "no_end": True},
        },
    )
    rid = created.json()["id"]
    occ = created.json()["next_run_on"]

    def once():
        return client.post(f"/api/v1/routines/{rid}/complete", params={"occurrence_on": occ})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: once(), range(2)))
    assert all(r.status_code == 200 for r in results)
    nexts = {r.json()["next_run_on"] for r in results}
    assert len(nexts) == 1
    listed = client.get("/api/v1/routines")
    assert len([r for r in listed.json() if r["id"] == rid]) == 1
