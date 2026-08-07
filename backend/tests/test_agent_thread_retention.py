"""Agent thread lifecycle — retention (max 5/org), no create-on-list, cascade cleanup."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal
from app.models.agent import (
    AgentMessage,
    AgentPendingAction,
    AgentRun,
    AgentThread,
    AgentToolCall,
)
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


def _count_threads(db, org_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(AgentThread)
            .where(AgentThread.organization_id == org_id)
        )
        or 0
    )


def _seed_thread_with_message(
    db,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    updated_at: datetime | None = None,
) -> AgentThread:
    thread = AgentThread(
        organization_id=org_id,
        user_id=user_id,
        title=title,
        status="active",
    )
    if updated_at is not None:
        thread.created_at = updated_at
        thread.updated_at = updated_at
    db.add(thread)
    db.flush()
    db.add(
        AgentMessage(
            thread_id=thread.id,
            organization_id=org_id,
            user_id=user_id,
            role="user",
            content=f"msg-{title}",
            message_type="text",
            status="ok",
        )
    )
    db.commit()
    db.refresh(thread)
    return thread


def test_list_and_get_do_not_create_threads(client, register_payload):
    _auth(client, register_payload)
    org_id, _user_id = _me(client)

    listed = client.get("/api/v1/agent/threads")
    assert listed.status_code == 200
    assert listed.json()["items"] == []

    listed2 = client.get("/api/v1/agent/threads")
    assert listed2.status_code == 200

    db = SessionLocal()
    try:
        assert _count_threads(db, org_id) == 0
    finally:
        db.close()


def test_create_thread_idempotent_while_empty(client, register_payload):
    _auth(client, register_payload)
    org_id, _user_id = _me(client)

    a = client.post("/api/v1/agent/threads", json={"title": "Primeira"})
    b = client.post("/api/v1/agent/threads", json={"title": "Segunda tentativa"})
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["id"] == b.json()["id"]
    assert b.json()["title"] == "Segunda tentativa"

    db = SessionLocal()
    try:
        assert _count_threads(db, org_id) == 1
    finally:
        db.close()


def test_retention_keeps_five_newest_and_deletes_messages(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    base = datetime.now(UTC) - timedelta(days=10)

    db = SessionLocal()
    try:
        seeded: list[AgentThread] = []
        for i in range(5):
            seeded.append(
                _seed_thread_with_message(
                    db,
                    org_id=org_id,
                    user_id=user_id,
                    title=f"old-{i}",
                    updated_at=base + timedelta(hours=i),
                )
            )
        oldest = seeded[0]
        newest_of_five = seeded[4]
        protect = threads_svc.create_thread(
            db, organization_id=org_id, user_id=user_id, title="nova-sexta"
        )
        threads_svc.append_message(
            db, thread=protect, role="user", content="hello", user_id=user_id
        )

        remaining_ids = {
            row.id
            for row in db.scalars(
                select(AgentThread).where(AgentThread.organization_id == org_id)
            ).all()
        }
        assert len(remaining_ids) == 5
        assert protect.id in remaining_ids
        assert newest_of_five.id in remaining_ids
        assert oldest.id not in remaining_ids

        orphan_msgs = db.scalar(
            select(func.count())
            .select_from(AgentMessage)
            .where(AgentMessage.thread_id == oldest.id)
        )
        assert orphan_msgs == 0

        kept_msgs = db.scalar(
            select(func.count())
            .select_from(AgentMessage)
            .where(AgentMessage.thread_id == protect.id)
        )
        assert kept_msgs == 1
    finally:
        db.close()


def test_current_thread_never_removed_even_if_stale_clock(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    base = datetime.now(UTC)

    db = SessionLocal()
    try:
        stale = _seed_thread_with_message(
            db,
            org_id=org_id,
            user_id=user_id,
            title="stale-current",
            updated_at=base - timedelta(days=30),
        )
        for i in range(5):
            _seed_thread_with_message(
                db,
                org_id=org_id,
                user_id=user_id,
                title=f"fresh-{i}",
                updated_at=base - timedelta(hours=i),
            )
        result = threads_svc.enforce_organization_thread_limit(
            db, organization_id=org_id, protect_thread_id=stale.id
        )
        assert result["remaining"] == 5
        still = db.get(AgentThread, stale.id)
        assert still is not None
    finally:
        db.close()


def test_empty_threads_purged_before_ranking(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)

    db = SessionLocal()
    try:
        empty = threads_svc.create_thread(
            db, organization_id=org_id, user_id=user_id, title="empty-draft"
        )
        # create_thread reuses empty — force a second empty by inserting directly
        ghost = AgentThread(
            organization_id=org_id,
            user_id=user_id,
            title="ghost",
            status="active",
        )
        db.add(ghost)
        db.commit()

        for i in range(5):
            _seed_thread_with_message(
                db, org_id=org_id, user_id=user_id, title=f"real-{i}"
            )

        threads_svc.enforce_organization_thread_limit(
            db, organization_id=org_id, protect_thread_id=None
        )
        assert db.get(AgentThread, empty.id) is None
        assert db.get(AgentThread, ghost.id) is None
        assert _count_threads(db, org_id) == 5
    finally:
        db.close()


def test_new_message_updates_ordering(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    base = datetime.now(UTC) - timedelta(hours=5)

    db = SessionLocal()
    try:
        older = _seed_thread_with_message(
            db, org_id=org_id, user_id=user_id, title="A", updated_at=base
        )
        newer = _seed_thread_with_message(
            db,
            org_id=org_id,
            user_id=user_id,
            title="B",
            updated_at=base + timedelta(hours=1),
        )
        listed = threads_svc.list_threads(
            db, organization_id=org_id, user_id=user_id
        )
        assert listed[0].id == newer.id

        threads_svc.append_message(
            db, thread=older, role="user", content="bump", user_id=user_id
        )
        listed2 = threads_svc.list_threads(
            db, organization_id=org_id, user_id=user_id
        )
        assert listed2[0].id == older.id
    finally:
        db.close()


def test_org_isolation_on_retention(client, register_payload):
    _auth(client, register_payload)
    org_a, user_a = _me(client)

    other = {
        **register_payload,
        "email": f"other_{register_payload['email']}",
        "organization_name": "Org B Retention",
    }
    client.cookies.clear()
    _auth(client, other)
    org_b, user_b = _me(client)

    db = SessionLocal()
    try:
        for i in range(5):
            _seed_thread_with_message(
                db, org_id=org_a, user_id=user_a, title=f"a-{i}"
            )
            _seed_thread_with_message(
                db, org_id=org_b, user_id=user_b, title=f"b-{i}"
            )
        threads_svc.create_thread(
            db, organization_id=org_a, user_id=user_a, title="a-sixth"
        )
        assert _count_threads(db, org_a) == 5
        assert _count_threads(db, org_b) == 5
    finally:
        db.close()


def test_cascade_deletes_runs_tools_pending(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)
    base = datetime.now(UTC)

    db = SessionLocal()
    try:
        doomed = _seed_thread_with_message(
            db,
            org_id=org_id,
            user_id=user_id,
            title="doomed",
            updated_at=base - timedelta(days=2),
        )
        run = AgentRun(
            thread_id=doomed.id,
            organization_id=org_id,
            user_id=user_id,
            provider="fake",
            model="fake",
            status="ok",
        )
        db.add(run)
        db.flush()
        db.add(
            AgentToolCall(
                run_id=run.id,
                organization_id=org_id,
                user_id=user_id,
                tool_name="get_today_summary",
                risk_class="read",
                status="ok",
            )
        )
        db.add(
            AgentPendingAction(
                organization_id=org_id,
                user_id=user_id,
                thread_id=doomed.id,
                tool_name="create_appointment",
                risk_class="write_common",
                arguments={},
                summary_text="test",
                status="pending",
                expires_at=base + timedelta(hours=1),
            )
        )
        db.commit()
        doomed_id = doomed.id
        run_id = run.id

        for i in range(5):
            _seed_thread_with_message(
                db,
                org_id=org_id,
                user_id=user_id,
                title=f"keep-{i}",
                updated_at=base + timedelta(hours=i),
            )
        threads_svc.enforce_organization_thread_limit(db, organization_id=org_id)

        assert db.get(AgentThread, doomed_id) is None
        assert (
            db.scalar(
                select(func.count()).select_from(AgentRun).where(AgentRun.id == run_id)
            )
            == 0
        )
        assert (
            db.scalar(
                select(func.count())
                .select_from(AgentToolCall)
                .where(AgentToolCall.run_id == run_id)
            )
            == 0
        )
        assert (
            db.scalar(
                select(func.count())
                .select_from(AgentPendingAction)
                .where(AgentPendingAction.thread_id == doomed_id)
            )
            == 0
        )
        assert (
            db.scalar(
                select(func.count())
                .select_from(AgentMessage)
                .where(AgentMessage.thread_id == doomed_id)
            )
            == 0
        )
    finally:
        db.close()


def test_list_capped_at_five(client, register_payload):
    _auth(client, register_payload)
    org_id, user_id = _me(client)

    db = SessionLocal()
    try:
        for i in range(5):
            _seed_thread_with_message(
                db, org_id=org_id, user_id=user_id, title=f"t-{i}"
            )
    finally:
        db.close()

    listed = client.get("/api/v1/agent/threads")
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 5
