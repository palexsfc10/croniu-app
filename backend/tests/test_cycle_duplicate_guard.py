"""Duplicate and overlapping cycle guards (semantic, not only idempotency)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, time
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.appointment import Appointment
from app.models.cycle import Cycle
from app.models.receivable import Receivable
from app.schemas.cycle_intelligence import IntelligentCycleCreate
from app.services.auth import AuthError
from app.services.cycle_intelligence import create_intelligent_cycle


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _seed(client: TestClient) -> dict:
    c = client.post("/api/v1/clients", json={"full_name": "Murilo Teste"})
    s = client.post(
        "/api/v1/services",
        json={
            "name": "Personal",
            "default_price_cents": 9000,
            "default_duration_minutes": 60,
        },
    )
    t = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": "2x mensal",
            "weekly_frequency": 2,
            "duration_type": "calendar_months",
            "duration_value": 1,
        },
    )
    assert c.status_code == 201 and s.status_code == 201 and t.status_code == 201
    return {
        "client_id": c.json()["id"],
        "service_id": s.json()["id"],
        "template_id": t.json()["id"],
    }


def _body(ids: dict, key: str, *, starts_on: str = "2026-08-17", time_s: str = "09:00:00") -> dict:
    return {
        "client_id": ids["client_id"],
        "service_id": ids["service_id"],
        "cycle_template_id": ids["template_id"],
        "starts_on": starts_on,
        "weekdays": [0, 2],
        "starts_time": time_s,
        "generate_appointments": True,
        "create_receivable": True,
        "idempotency_key": key,
    }


def _counts(client: TestClient) -> tuple[int, int]:
    return (
        len(client.get("/api/v1/cycles").json()),
        len(client.get("/api/v1/receivables").json()),
    )


def test_same_idempotency_key_replays(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "same-key-once"))
    assert first.status_code == 201, first.text
    second = client.post("/api/v1/cycles/intelligent", json=_body(ids, "same-key-once"))
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]
    c, r = _counts(client)
    assert c == 1 and r == 1


def test_different_keys_identical_cycle_rejected(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "dup-a"))
    assert first.status_code == 201, first.text
    second = client.post("/api/v1/cycles/intelligent", json=_body(ids, "dup-b"))
    assert second.status_code == 409, second.text
    assert second.json()["code"] == "DUPLICATE_CYCLE"
    assert second.json()["details"]["existing_cycle_id"] == first.json()["id"]
    c, r = _counts(client)
    assert c == 1 and r == 1


def test_overlapping_period_rejected(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "ov-a"))
    assert first.status_code == 201, first.text
    second = client.post(
        "/api/v1/cycles/intelligent",
        json=_body(ids, "ov-b", starts_on="2026-08-24"),
    )
    assert second.status_code == 409, second.text
    assert second.json()["code"] == "OVERLAPPING_CYCLE"
    assert _counts(client)[0] == 1


def test_sequential_period_allowed(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "seq-a"))
    assert first.status_code == 201, first.text
    ends = first.json()["ends_on"]
    second = client.post(
        "/api/v1/cycles/intelligent",
        json=_body(ids, "seq-b", starts_on=ends),
    )
    assert second.status_code == 201, second.text
    assert second.json()["id"] != first.json()["id"]
    assert len(client.get("/api/v1/cycles").json()) == 2


def test_different_service_allowed(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "svc-a"))
    assert first.status_code == 201, first.text
    other = client.post(
        "/api/v1/services",
        json={
            "name": "Pilates",
            "default_price_cents": 8000,
            "default_duration_minutes": 50,
        },
    )
    assert other.status_code == 201, other.text
    body = _body(ids, "svc-b", time_s="18:00:00")
    body["service_id"] = other.json()["id"]
    second = client.post("/api/v1/cycles/intelligent", json=body)
    assert second.status_code == 201, second.text
    assert len(client.get("/api/v1/cycles").json()) == 2


def test_cancelled_cycle_does_not_block(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "can-a"))
    assert first.status_code == 201, first.text
    cancel = client.post(f"/api/v1/cycles/{first.json()['id']}/cancel")
    assert cancel.status_code == 200, cancel.text
    second = client.post("/api/v1/cycles/intelligent", json=_body(ids, "can-b"))
    assert second.status_code == 201, second.text
    rows = client.get("/api/v1/cycles").json()
    assert len(rows) == 2
    assert {r["status"] for r in rows} == {"cancelled", "active"}


def test_ended_cycle_does_not_block_future(client, register_payload, db_session):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "end-a"))
    assert first.status_code == 201, first.text
    row = db_session.get(Cycle, UUID(first.json()["id"]))
    assert row is not None
    row.status = "ended"
    db_session.commit()
    second = client.post(
        "/api/v1/cycles/intelligent",
        json=_body(ids, "end-b", starts_on=first.json()["ends_on"]),
    )
    assert second.status_code == 201, second.text


def test_other_client_does_not_interfere(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    other = client.post("/api/v1/clients", json={"full_name": "Outra Aluna"}).json()["id"]
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "cli-a"))
    assert first.status_code == 201, first.text
    body = _body(ids, "cli-b", time_s="18:00:00")
    body["client_id"] = other
    second = client.post("/api/v1/cycles/intelligent", json=body)
    assert second.status_code == 201, second.text


def test_other_tenant_does_not_interfere(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    first = client.post("/api/v1/cycles/intelligent", json=_body(ids, "ten-a"))
    assert first.status_code == 201, first.text
    payload2 = {
        "email": "other-tenant@example.com",
        "password": "SenhaForte1!",
        "full_name": "Outro Prof",
        "organization_name": "Studio Outro",
    }
    _auth(client, payload2)
    ids2 = _seed(client)
    second = client.post("/api/v1/cycles/intelligent", json=_body(ids2, "ten-b"))
    assert second.status_code == 201, second.text


def test_retry_after_schedule_conflict_then_adjust_creates_one(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org = client.get("/api/v1/auth/me").json()["organization"]["id"]
    from datetime import timedelta
    from zoneinfo import ZoneInfo

    from app.services import agenda as agenda_svc

    tz = ZoneInfo("America/Sao_Paulo")
    seed_db = SessionLocal()
    try:
        start = __import__("datetime").datetime(2026, 8, 17, 9, 0, tzinfo=tz)
        agenda_svc.create_appointment(
            seed_db,
            organization_id=UUID(org),
            client_id=UUID(ids["client_id"]),
            starts_at=start,
            ends_at=start + timedelta(hours=1),
        )
    finally:
        seed_db.close()

    conflict = client.post("/api/v1/cycles/intelligent", json=_body(ids, "conf-1"))
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["code"] == "SCHEDULE_CONFLICT"
    assert _counts(client)[0] == 0

    retry_same = client.post("/api/v1/cycles/intelligent", json=_body(ids, "conf-1"))
    assert retry_same.status_code == 409

    ok = client.post(
        "/api/v1/cycles/intelligent",
        json=_body(ids, "conf-2", time_s="18:00:00"),
    )
    assert ok.status_code == 201, ok.text
    c, r = _counts(client)
    assert c == 1 and r == 1


def test_concurrent_identical_creates_single_cycle(client, register_payload):
    _auth(client, register_payload)
    ids = _seed(client)
    org_id = UUID(client.get("/api/v1/auth/me").json()["organization"]["id"])

    def worker(key: str):
        db = SessionLocal()
        try:
            payload = IntelligentCycleCreate(
                client_id=UUID(ids["client_id"]),
                service_id=UUID(ids["service_id"]),
                cycle_template_id=UUID(ids["template_id"]),
                starts_on=date(2026, 8, 17),
                weekdays=[0, 2],
                starts_time=time(9, 0),
                generate_appointments=True,
                create_receivable=True,
                idempotency_key=key,
            )
            return create_intelligent_cycle(
                db, organization_id=org_id, payload=payload
            )
        except AuthError as exc:
            return exc
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, ["race-a", "race-b"]))

    errors = [r for r in results if isinstance(r, AuthError)]
    cycles = [r for r in results if not isinstance(r, AuthError)]
    assert len(cycles) == 1, results
    assert len(errors) == 1
    assert errors[0].code in {"DUPLICATE_CYCLE", "OVERLAPPING_CYCLE"}

    db = SessionLocal()
    try:
        n_cycles = db.scalar(select(func.count()).select_from(Cycle).where(Cycle.organization_id == org_id))
        n_rec = db.scalar(
            select(func.count()).select_from(Receivable).where(Receivable.organization_id == org_id)
        )
        n_appts = db.scalar(
            select(func.count()).select_from(Appointment).where(
                Appointment.organization_id == org_id,
                Appointment.cycle_id.is_not(None),
            )
        )
        assert n_cycles == 1
        assert n_rec == 1
        assert n_appts == cycles[0].lesson_count
    finally:
        db.close()
