"""Exclusive ends_on vigency: one current cycle on the sequential boundary."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from fastapi.testclient import TestClient

from app.agent.tools import ToolContext, _get_client_cycle_status, _get_client_overview
from app.services import cycle_period as cycle_period_svc


@dataclass
class _Row:
    status: str
    starts_on: date
    ends_on: date
    is_legacy: bool = False


PREV_START = date(2026, 8, 17)
PREV_END = date(2026, 9, 17)
NEXT_START = date(2026, 9, 17)
NEXT_END = date(2026, 10, 17)


def test_civil_last_inclusive_boundaries():
    assert cycle_period_svc.last_inclusive_on(date(2026, 9, 17)) == date(2026, 9, 16)
    assert cycle_period_svc.last_inclusive_on(date(2026, 3, 1)) == date(2026, 2, 28)
    assert cycle_period_svc.last_inclusive_on(date(2024, 3, 1)) == date(2024, 2, 29)
    assert cycle_period_svc.last_inclusive_on(date(2027, 1, 1)) == date(2026, 12, 31)
    assert cycle_period_svc.last_inclusive_on(date(2026, 1, 1)) == date(2025, 12, 31)


def test_one_day_interval_and_legacy_exclusive_window():
    start = date(2026, 8, 17)
    end = date(2026, 8, 18)
    assert cycle_period_svc.is_current(starts_on=start, ends_on=end, today=start)
    assert not cycle_period_svc.is_current(starts_on=start, ends_on=end, today=end)
    legacy = _Row("active", start, end, is_legacy=True)
    assert cycle_period_svc.pick_operational_cycle([legacy], end) is None
    assert cycle_period_svc.pick_operational_cycle([legacy], start) is legacy


def test_pick_never_returns_both_on_sequential_boundary():
    prev = _Row("active", PREV_START, PREV_END)
    nxt = _Row("active", NEXT_START, NEXT_END)
    rows = [prev, nxt]
    assert cycle_period_svc.pick_operational_cycle(rows, date(2026, 9, 16)) is prev
    assert cycle_period_svc.is_upcoming(starts_on=nxt.starts_on, today=date(2026, 9, 16))
    assert cycle_period_svc.pick_operational_cycle(rows, date(2026, 9, 17)) is nxt
    assert cycle_period_svc.is_elapsed(ends_on=prev.ends_on, today=date(2026, 9, 17))
    assert cycle_period_svc.pick_operational_cycle(rows, date(2026, 10, 17)) is None
    assert cycle_period_svc.is_elapsed(ends_on=nxt.ends_on, today=date(2026, 10, 17))


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _freeze(monkeypatch, day: date) -> None:
    monkeypatch.setattr("app.services.agenda.org_local_today", lambda org: day)
    monkeypatch.setattr("app.services.accompaniment._today", lambda db, oid: day)


def _seed_sequential(client: TestClient) -> dict:
    person = client.post("/api/v1/clients", json={"full_name": "Fronteira Vigencia"}).json()
    service = client.post(
        "/api/v1/services",
        json={"name": "Personal", "default_price_cents": 10000, "default_duration_minutes": 60},
    ).json()
    prev = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": PREV_START.isoformat(),
            "ends_on": PREV_END.isoformat(),
            "value_cents": 10000,
            "create_receivable": False,
        },
    )
    assert prev.status_code == 201, prev.text
    nxt = client.post(
        "/api/v1/cycles",
        json={
            "client_id": person["id"],
            "service_id": service["id"],
            "starts_on": NEXT_START.isoformat(),
            "ends_on": NEXT_END.isoformat(),
            "value_cents": 10000,
            "create_receivable": False,
        },
    )
    assert nxt.status_code == 201, nxt.text
    token = client.post(f"/api/v1/clients/{person['id']}/public-access").json()["token"]
    me = client.get("/api/v1/auth/me").json()
    return {
        "client_id": person["id"],
        "prev_id": prev.json()["id"],
        "next_id": nxt.json()["id"],
        "token": token,
        "org_id": me["organization"]["id"],
        "user_id": me["user"]["id"],
    }


def _classify(rows: list[dict], today: date) -> tuple[list[str], list[str], list[str]]:
    current, upcoming, ended = [], [], []
    for row in rows:
        starts = date.fromisoformat(row["starts_on"])
        ends = date.fromisoformat(row["ends_on"])
        if cycle_period_svc.is_current(starts_on=starts, ends_on=ends, today=today):
            current.append(row["id"])
        elif cycle_period_svc.is_upcoming(starts_on=starts, today=today):
            upcoming.append(row["id"])
        elif cycle_period_svc.is_elapsed(ends_on=ends, today=today):
            ended.append(row["id"])
    return current, upcoming, ended


def test_api_resolvers_sequential_boundary(client, register_payload, monkeypatch, db_session):
    _auth(client, register_payload)
    ids = _seed_sequential(client)

    def _assert_day(day: date, *, current: str, upcoming: str | None, portal_current: str, portal_status: str):
        _freeze(monkeypatch, day)
        listed = client.get("/api/v1/cycles", params={"client_id": ids["client_id"]}).json()
        cur, up, ended = _classify(listed, day)
        assert cur == [current]
        if upcoming:
            assert upcoming in up
        assert len(cur) == 1
        picked = cycle_period_svc.pick_operational_cycle(
            [
                _Row(r["status"], date.fromisoformat(r["starts_on"]), date.fromisoformat(r["ends_on"]))
                for r in listed
            ],
            day,
        )
        assert picked is not None
        # Map back by dates
        match = [
            r["id"]
            for r in listed
            if r["starts_on"] == picked.starts_on.isoformat() and r["ends_on"] == picked.ends_on.isoformat()
        ]
        assert match == [current]

        journey = client.get(f"/api/v1/clients/{ids['client_id']}/journey").json()
        summary = (journey.get("accompaniment_summaries") or {}).get("cycle") or ""
        last = cycle_period_svc.last_inclusive_on(date.fromisoformat(
            next(r["ends_on"] for r in listed if r["id"] == current)
        ))
        start = date.fromisoformat(next(r["starts_on"] for r in listed if r["id"] == current))
        assert f"{start.strftime('%d/%m')} a {last.strftime('%d/%m')}" in summary

        portal = client.get(f"/api/v1/public/my-cycle/{ids['token']}").json()
        assert portal["cycle"]["starts_on"] == next(
            r["starts_on"] for r in listed if r["id"] == portal_current
        )
        assert portal["cycle"]["status_summary"] == portal_status

        ctx = ToolContext(
            organization_id=UUID(ids["org_id"]),
            user_id=UUID(ids["user_id"]),
            db=db_session,
            today=day,
        )
        status = _get_client_cycle_status(ctx, {"client_id": ids["client_id"]})
        overview = _get_client_overview(ctx, {"client_id": ids["client_id"]})
        assert [c["id"] for c in status["active_cycles"]] == [current]
        assert [c["id"] for c in overview["active_cycles"]] == [current]

        home = client.get("/api/v1/home/summary").json()
        nearing_ids = {c["id"] for c in home.get("cycles_nearing_end", [])}
        assert not ({ids["prev_id"], ids["next_id"]} <= nearing_ids)

    _assert_day(
        date(2026, 9, 16),
        current=ids["prev_id"],
        upcoming=ids["next_id"],
        portal_current=ids["prev_id"],
        portal_status="encerrando",
    )
    _assert_day(
        date(2026, 9, 17),
        current=ids["next_id"],
        upcoming=None,
        portal_current=ids["next_id"],
        portal_status="vigente",
    )

    _freeze(monkeypatch, date(2026, 10, 17))
    listed = client.get("/api/v1/cycles", params={"client_id": ids["client_id"]}).json()
    cur, _up, ended = _classify(listed, date(2026, 10, 17))
    assert cur == []
    assert ids["next_id"] in ended
    portal = client.get(f"/api/v1/public/my-cycle/{ids['token']}").json()
    assert portal["cycle"]["status_summary"] == "encerrado"
    assert portal["cycle"]["ends_on"] == NEXT_END.isoformat()
