"""AI tool tests for get_available_slots — direct handler invocation, same
pattern as test_agent_foundation.py. The tool is a thin, read-only wrapper
around app.services.availability; these tests confirm it never invents data
and distinguishes the states the assistant must not confuse (§13/§20 spec).
"""

from __future__ import annotations

import uuid
from datetime import date, time

from zoneinfo import ZoneInfo

from app.agent.tools import ToolContext, get_tool
from app.db import SessionLocal
from app.schemas.availability import AvailabilitySettingsUpdate, DayScheduleIn
from app.services import agenda as agenda_svc
from app.services import availability as availability_svc
from app.services import domain as domain_svc
from app.services.cycle_schedule import local_dt


def _auth(client, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201


def _me(client) -> tuple[uuid.UUID, uuid.UUID]:
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _configure_week(db, organization_id: uuid.UUID) -> None:
    days = [
        DayScheduleIn(
            weekday=wd,
            is_active=wd < 5,
            starts_time="08:00",
            ends_time="18:00",
            break_starts_time="12:00" if wd < 5 else None,
            break_ends_time="13:00" if wd < 5 else None,
            default_duration_minutes=60,
        )
        for wd in range(7)
    ]
    availability_svc.update_settings(
        db,
        organization_id=organization_id,
        role="owner",
        payload=AvailabilitySettingsUpdate(days=days),
    )


def test_tool_registered_as_read_no_confirmation():
    tool = get_tool("get_available_slots")
    assert tool.kind == "read"
    assert tool.requires_confirmation is False


def test_tool_reports_journey_not_configured(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("get_available_slots").handler(ctx, {"starts_on": "2026-09-07"})
        assert result["configured"] is False
        assert "configurar" in result["note"].lower()
        assert result["days"][0]["slots"] == []
    finally:
        db.close()


def test_tool_reports_day_off(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        _configure_week(db, org_id)
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        # 2026-09-06 is a Sunday
        result = get_tool("get_available_slots").handler(ctx, {"starts_on": "2026-09-06"})
        assert result["configured"] is True
        assert result["days"][0]["is_active"] is False
        assert result["days"][0]["slots"] == []
    finally:
        db.close()


def test_tool_returns_real_slots_matching_engine(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        _configure_week(db, org_id)
        # 2026-09-07 is a Monday
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("get_available_slots").handler(ctx, {"starts_on": "2026-09-07"})
        assert result["configured"] is True
        engine = availability_svc.compute_day(
            db, organization_id=org_id, day=date(2026, 9, 7)
        )
        assert result["days"][0]["slots"] == [s.label for s in engine.slots]
        assert len(result["days"][0]["slots"]) > 0
    finally:
        db.close()


def test_tool_no_slots_when_fully_booked(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        _configure_week(db, org_id)
        # Narrow the Monday journey to exactly one slot, then book it.
        days = [
            DayScheduleIn(
                weekday=wd,
                is_active=wd < 5,
                starts_time="09:00" if wd == 0 else "08:00",
                ends_time="10:00" if wd == 0 else "18:00",
                break_starts_time=None,
                break_ends_time=None,
                default_duration_minutes=60,
            )
            for wd in range(7)
        ]
        availability_svc.update_settings(
            db,
            organization_id=org_id,
            role="owner",
            payload=AvailabilitySettingsUpdate(days=days),
        )
        person = domain_svc.create_client(
            db,
            organization_id=org_id,
            full_name="Cliente Teste",
            phone=None,
            email=None,
            notes=None,
        )
        tz = ZoneInfo("America/Sao_Paulo")
        monday = date(2026, 9, 7)
        agenda_svc.create_appointment(
            db,
            organization_id=org_id,
            client_id=person.id,
            starts_at=local_dt(monday, time(9, 0), tz),
            ends_at=local_dt(monday, time(10, 0), tz),
        )

        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("get_available_slots").handler(ctx, {"starts_on": "2026-09-07"})
        assert result["days"][0]["slots"] == []
    finally:
        db.close()


def test_tool_period_filter(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    db = SessionLocal()
    try:
        _configure_week(db, org_id)
        ctx = ToolContext(organization_id=org_id, user_id=user_id, db=db)
        result = get_tool("get_available_slots").handler(
            ctx, {"starts_on": "2026-09-07", "period": "manha"}
        )
        for label in result["days"][0]["slots"]:
            hour = int(label.split(":")[0])
            assert hour < 12
    finally:
        db.close()


# 20 (tool). Isolamento entre tenants
def test_tool_tenant_isolation(client, register_payload):
    _auth(client, register_payload)
    org_a, _ = _me(client)
    db = SessionLocal()
    try:
        _configure_week(db, org_a)
    finally:
        db.close()

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Outra Org Tool",
    }
    client.cookies.clear()
    assert client.post("/api/v1/auth/register", json=other).status_code == 201
    org_b, user_b = _me(client)
    assert org_b != org_a

    db = SessionLocal()
    try:
        ctx = ToolContext(organization_id=org_b, user_id=user_b, db=db)
        result = get_tool("get_available_slots").handler(ctx, {"starts_on": "2026-09-07"})
        # Org B never configured its own journey — must not see org A's.
        assert result["configured"] is False
    finally:
        db.close()
