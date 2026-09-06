"""AI coverage for renewal cases: list_renewal_cases, propose/execute
mark_awaiting_client, propose/execute end_renewal_without_renewal.

Same pattern as test_agent_cycle_evaluation_routine_actions.py: handlers are
called directly (no full chat pipeline) to verify confirmation contract,
tenant isolation, and manual/AI parity quickly.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest

from app.agent.tools import TOOLS, WRITE_EXECUTORS, ToolContext, get_tool
from app.db import SessionLocal
from app.services.auth import AuthError


def _auth(client, payload: dict) -> tuple[uuid.UUID, uuid.UUID]:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _ctx(db, org_id: uuid.UUID, user_id: uuid.UUID) -> ToolContext:
    return ToolContext(organization_id=org_id, user_id=user_id, db=db)


def _today(client) -> date:
    return date.fromisoformat(
        client.get("/api/v1/organization/preferences").json()["local_today"]
    )


def _seed_cycle(client, key: str, *, starts_on: str) -> dict:
    client_id = client.post(
        "/api/v1/clients", json={"full_name": "Cliente IA Renovação", "phone": "11988887777"}
    ).json()["id"]
    service_id = client.post(
        "/api/v1/services",
        json={"name": "Aula", "default_price_cents": 9000, "default_duration_minutes": 60},
    ).json()["id"]
    template_id = client.post(
        "/api/v1/cycle-templates",
        json={
            "name": f"tmpl-{key}",
            "weekly_frequency": 1,
            "duration_type": "fixed_days",
            "duration_value": 5,
        },
    ).json()["id"]
    created = client.post(
        "/api/v1/cycles/intelligent",
        json={
            "client_id": client_id,
            "service_id": service_id,
            "cycle_template_id": template_id,
            "starts_on": starts_on,
            "weekdays": [date.fromisoformat(starts_on).weekday()],
            "starts_time": "09:00:00",
            "idempotency_key": key,
        },
    )
    assert created.status_code == 201, created.text
    return {"client_id": client_id, "cycle_id": created.json()["id"]}


def test_no_pause_or_complete_cycle_tool_exists_still_holds_with_renewal_tools():
    names = set(TOOLS.keys()) | set(WRITE_EXECUTORS.keys())
    assert not any("pause" in n for n in names)
    assert not any("complete_cycle" in n or "cycle_completed" in n for n in names)
    assert not any("portal" in n or "public_access" in n for n in names)


def test_list_renewal_cases_distinct_from_list_renewal_requests(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, "ia-list-1", starts_on=today.isoformat())
    db = SessionLocal()
    try:
        result = get_tool("list_renewal_cases").handler(_ctx(db, org_id, user_id), {})
        assert result["count"] == 1
        assert result["renewal_cases"][0]["cycle_id"] == ids["cycle_id"]
        assert result["renewal_cases"][0]["status"] in {"upcoming", "pending"}

        # No portal request was made — the portal-only tool sees nothing.
        portal = get_tool("list_renewal_requests").handler(_ctx(db, org_id, user_id), {})
        assert portal["count"] == 0
    finally:
        db.close()


def test_propose_mark_awaiting_client_requires_confirmation_and_executes(
    client, register_payload
):
    org_id, user_id = _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, "ia-await-1", starts_on=today.isoformat())
    next_contact = (today + timedelta(days=3)).isoformat()
    db = SessionLocal()
    try:
        proposal = get_tool("propose_mark_awaiting_client").handler(
            _ctx(db, org_id, user_id),
            {"cycle_id": ids["cycle_id"], "next_contact_date": next_contact},
        )
        assert proposal["needs_confirmation"] is True
        assert proposal["risk_class"] == "write_common"
        assert proposal["summary_fields"]["Próximo contato"]

        result = WRITE_EXECUTORS["mark_awaiting_client"](
            _ctx(db, org_id, user_id),
            {"cycle_id": ids["cycle_id"], "next_contact_date": next_contact},
        )
        assert result["status"] == "awaiting_client"
        assert result["next_contact_date"] == next_contact
    finally:
        db.close()

    # Manual API sees the same real state.
    manual = client.get("/api/v1/renewal-cases?scope=all").json()
    row = next(v for v in manual if v["source_cycle_id"] == ids["cycle_id"])
    assert row["display_status"] == "awaiting_client"


def test_propose_end_renewal_without_renewal_executes_and_never_touches_the_cycle(
    client, register_payload
):
    org_id, user_id = _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, "ia-end-1", starts_on=today.isoformat())
    db = SessionLocal()
    try:
        proposal = get_tool("propose_end_renewal_without_renewal").handler(
            _ctx(db, org_id, user_id),
            {"cycle_id": ids["cycle_id"], "resolution_reason": "no_response"},
        )
        assert proposal["needs_confirmation"] is True
        assert proposal["risk_class"] == "write_common"

        result = WRITE_EXECUTORS["end_renewal_without_renewal"](
            _ctx(db, org_id, user_id),
            {"cycle_id": ids["cycle_id"], "resolution_reason": "no_response"},
        )
        assert result["status"] == "ended_without_renewal"
    finally:
        db.close()

    # The cycle itself is untouched by this action — status unaffected.
    cycle = client.get(f"/api/v1/cycles/{ids['cycle_id']}").json()
    assert cycle["status"] == "active"

    manual = client.get("/api/v1/renewal-cases").json()
    assert not any(v["source_cycle_id"] == ids["cycle_id"] for v in manual)


def test_renewal_case_tools_are_tenant_isolated(client, register_payload):
    org_id, user_id = _auth(client, register_payload)
    today = _today(client)
    ids = _seed_cycle(client, "ia-tenant-1", starts_on=today.isoformat())

    client.cookies.clear()
    other_payload = {
        **register_payload,
        "email": f"ext_{register_payload['email']}",
        "organization_name": "Studio Ext IA Renewals",
    }
    other_org_id, other_user_id = _auth(client, other_payload)

    db = SessionLocal()
    try:
        result = get_tool("list_renewal_cases").handler(
            _ctx(db, other_org_id, other_user_id), {}
        )
        assert result["count"] == 0

        with pytest.raises(AuthError):
            WRITE_EXECUTORS["mark_awaiting_client"](
                _ctx(db, other_org_id, other_user_id),
                {"cycle_id": ids["cycle_id"], "next_contact_date": today.isoformat()},
            )
    finally:
        db.close()
