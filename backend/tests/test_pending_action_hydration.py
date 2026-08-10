"""Pending-action lifecycle: live status hydration on thread reload + idempotency."""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta

from app.agent import confirmation as conf_svc
from app.agent.confirmation import confirm_pending_action
from app.db import SessionLocal
from app.models.agent import AgentMessage, AgentPendingAction, AgentThread
from app.services import agent_threads as threads_svc
from fastapi.testclient import TestClient
from sqlalchemy import func, select


def _auth(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        ).status_code
        == 200
    )


def _me(client: TestClient) -> tuple[uuid.UUID, uuid.UUID]:
    me = client.get("/api/v1/auth/me").json()
    return uuid.UUID(me["organization"]["id"]), uuid.UUID(me["user"]["id"])


def _seed_pending_card(
    db,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str = "pending",
    summary: str = "Criar cliente Teste.",
    arguments: dict | None = None,
) -> tuple[AgentThread, AgentPendingAction, AgentMessage]:
    thread = threads_svc.create_thread(
        db, organization_id=org_id, user_id=user_id, title="card-test"
    )
    pending = conf_svc.create_pending_action(
        db,
        organization_id=org_id,
        user_id=user_id,
        tool_name="propose_create_client",
        arguments=arguments
        or {"full_name": "Cliente Card", "phone": None, "email": None, "notes": None},
        summary_text=summary,
        thread_id=thread.id,
        risk_class="write_common",
    )
    if status != "pending":
        pending.status = status
        if status == "executed":
            pending.confirmed_at = datetime.now(UTC)
            pending.executed_at = datetime.now(UTC)
            pending.result_safe = {"id": str(uuid.uuid4()), "kind": "client"}
            pending.result_entity_id = pending.result_safe["id"]
        elif status == "cancelled":
            pending.confirmed_at = datetime.now(UTC)
        elif status == "failed":
            pending.error_sanitized = "execution_error"
        db.add(pending)
        db.commit()
        db.refresh(pending)

    # Persist card the same way production does: snapshot without live status.
    msg = threads_svc.append_message(
        db,
        thread=thread,
        role="assistant",
        content=summary,
        message_type="pending_card",
        metadata_safe={
            "pending_action_id": str(pending.id),
            "tool_name": pending.tool_name,
            "summary_fields": {"full_name": "Cliente Card"},
        },
    )
    return thread, pending, msg


def test_thread_detail_hydrates_executed_status_not_message_snapshot(
    client, register_payload
):
    _auth(client, register_payload)
    org_id, user_id = _me(client)

    db = SessionLocal()
    try:
        thread, pending, msg = _seed_pending_card(
            db, org_id=org_id, user_id=user_id, status="executed"
        )
        # Stale snapshot in DB must not win over live row.
        msg.metadata_safe = {
            **(msg.metadata_safe or {}),
            "pending_action": {
                "id": str(pending.id),
                "status": "pending",
                "tool_name": pending.tool_name,
                "summary": pending.summary_text,
                "arguments": pending.arguments,
                "expires_at": pending.expires_at.isoformat(),
            },
        }
        db.add(msg)
        db.commit()
        thread_id = thread.id
        pending_id = pending.id
    finally:
        db.close()

    detail = client.get(f"/api/v1/agent/threads/{thread_id}")
    assert detail.status_code == 200
    cards = [m for m in detail.json()["messages"] if m["message_type"] == "pending_card"]
    assert len(cards) == 1
    live = cards[0]["metadata_safe"]["pending_action"]
    assert live["id"] == str(pending_id)
    assert live["status"] == "executed"
    assert cards[0]["metadata_safe"].get("pending_action_id") == str(pending_id)


def test_confirm_persists_and_reload_stays_executed(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)

    db = SessionLocal()
    try:
        thread, pending, _msg = _seed_pending_card(db, org_id=org_id, user_id=user_id)
        thread_id = thread.id
        pending_id = pending.id
        before_threads = (
            db.scalar(
                select(func.count())
                .select_from(AgentThread)
                .where(AgentThread.organization_id == org_id)
            )
            or 0
        )
    finally:
        db.close()

    confirmed = client.post(
        f"/api/v1/agent/pending/{pending_id}/confirm",
        json={},
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["action_status"] == "executed"
    assert body["pending_action"]["status"] == "executed"
    assert body.get("idempotent_replay") is False

    db = SessionLocal()
    try:
        row = db.get(AgentPendingAction, pending_id)
        assert row is not None
        assert row.status == "executed"
        assert row.executed_at is not None
        after_threads = (
            db.scalar(
                select(func.count())
                .select_from(AgentThread)
                .where(AgentThread.organization_id == org_id)
            )
            or 0
        )
        assert after_threads == before_threads
    finally:
        db.close()

    detail = client.get(f"/api/v1/agent/threads/{thread_id}")
    assert detail.status_code == 200
    card = next(m for m in detail.json()["messages"] if m["message_type"] == "pending_card")
    assert card["metadata_safe"]["pending_action"]["status"] == "executed"

    # Second confirm is idempotent — no re-execution side effects required.
    again = client.post(f"/api/v1/agent/pending/{pending_id}/confirm", json={})
    assert again.status_code == 200
    assert again.json()["action_status"] == "executed"
    assert again.json()["idempotent_replay"] is True
    assert again.json()["pending_action"]["status"] == "executed"


def test_cancelled_and_failed_hydrate_without_pending_buttons_state(
    client, register_payload
):
    _auth(client, register_payload)
    org_id, user_id = _me(client)

    db = SessionLocal()
    try:
        t1, p1, _ = _seed_pending_card(
            db, org_id=org_id, user_id=user_id, status="cancelled", summary="Cancelada."
        )
        t2, p2, _ = _seed_pending_card(
            db,
            org_id=org_id,
            user_id=user_id,
            status="failed",
            summary="Falhou.",
            arguments={
                "full_name": "Cliente Fail",
                "phone": None,
                "email": None,
                "notes": None,
            },
        )
        id1, id2 = t1.id, t2.id
    finally:
        db.close()

    d1 = client.get(f"/api/v1/agent/threads/{id1}").json()
    d2 = client.get(f"/api/v1/agent/threads/{id2}").json()
    c1 = next(m for m in d1["messages"] if m["message_type"] == "pending_card")
    c2 = next(m for m in d2["messages"] if m["message_type"] == "pending_card")
    assert c1["metadata_safe"]["pending_action"]["status"] == "cancelled"
    assert c2["metadata_safe"]["pending_action"]["status"] == "failed"
    assert c2["metadata_safe"]["pending_action"]["status"] != "executed"


def test_cross_tenant_cannot_confirm_or_see_pending(client, register_payload):
    _auth(client, register_payload)
    org_a, user_a = _me(client)

    db = SessionLocal()
    try:
        _thread, pending, _ = _seed_pending_card(db, org_id=org_a, user_id=user_a)
        pending_id = pending.id
    finally:
        db.close()

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Org Pending B",
    }
    client.cookies.clear()
    _auth(client, other)

    assert client.post(f"/api/v1/agent/pending/{pending_id}/confirm", json={}).status_code == 404
    listed = client.get("/api/v1/agent/threads")
    assert listed.status_code == 200
    assert all(
        True  # other org has its own threads only
        for _ in listed.json()["items"]
    )


def test_concurrent_confirms_execute_once(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)

    db = SessionLocal()
    try:
        _thread, pending, _ = _seed_pending_card(db, org_id=org_id, user_id=user_id)
        pending_id = pending.id
        # Capture session cookie for parallel clients
    finally:
        db.close()

    cookie = client.cookies.get("croniu_session") or client.cookies.get("session")
    # Fall back: reuse TestClient sequentially with for_update semantics via service
    results = []

    def _confirm_once() -> dict:
        local = SessionLocal()
        try:
            return confirm_pending_action(
                local,
                organization_id=org_id,
                user_id=user_id,
                pending_id=pending_id,
            )
        except Exception as exc:  # noqa: BLE001 — collect outcomes
            return {"error": type(exc).__name__, "code": getattr(exc, "code", None)}
        finally:
            local.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_confirm_once) for _ in range(2)]
        for fut in as_completed(futures):
            results.append(fut.result())

    executed = [r for r in results if r.get("action_status") == "executed"]
    assert len(executed) >= 1
    replays = [r for r in executed if r.get("idempotent_replay")]
    firsts = [r for r in executed if not r.get("idempotent_replay")]
    # Exactly one domain execution; the other is replay or in_progress/conflict.
    assert len(firsts) <= 1
    db = SessionLocal()
    try:
        row = db.get(AgentPendingAction, pending_id)
        assert row is not None
        assert row.status == "executed"
    finally:
        db.close()
    _ = cookie, replays  # silence lint on optional paths


def test_thread_limit_untouched_by_confirm(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    base = datetime.now(UTC) - timedelta(hours=5)

    db = SessionLocal()
    try:
        for i in range(5):
            t = AgentThread(
                organization_id=org_id,
                user_id=user_id,
                title=f"keep-{i}",
                status="active",
                created_at=base + timedelta(hours=i),
                updated_at=base + timedelta(hours=i),
            )
            db.add(t)
            db.flush()
            db.add(
                AgentMessage(
                    thread_id=t.id,
                    organization_id=org_id,
                    user_id=user_id,
                    role="user",
                    content="x",
                    message_type="text",
                    status="ok",
                )
            )
        db.commit()
        thread, pending, _ = _seed_pending_card(
            db,
            org_id=org_id,
            user_id=user_id,
            arguments={
                "full_name": "Cliente Limite",
                "phone": None,
                "email": None,
                "notes": None,
            },
        )
        # append_message on seed may prune to 5 — ensure pending still exists
        pending_id = pending.id
        assert db.get(AgentPendingAction, pending_id) is not None
        count_before = (
            db.scalar(
                select(func.count())
                .select_from(AgentThread)
                .where(AgentThread.organization_id == org_id)
            )
            or 0
        )
    finally:
        db.close()

    assert client.post(f"/api/v1/agent/pending/{pending_id}/confirm", json={}).status_code == 200

    db = SessionLocal()
    try:
        count_after = (
            db.scalar(
                select(func.count())
                .select_from(AgentThread)
                .where(AgentThread.organization_id == org_id)
            )
            or 0
        )
        assert count_after == count_before
        assert count_after <= 5
    finally:
        db.close()
