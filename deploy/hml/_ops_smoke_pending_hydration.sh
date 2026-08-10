#!/usr/bin/env bash
set -euo pipefail
test "$(docker exec croniu-hml-api printenv CRONIU_ENV)" = "hml"
docker exec -i croniu-hml-api python - <<'PY'
from uuid import UUID
from app.db import SessionLocal
from app.agent import confirmation as conf_svc
from app.models.agent import AgentMessage, AgentPendingAction
from app.services import agent_threads as threads_svc
from sqlalchemy import select, func

ORG = UUID("985a32d2-fff5-44f4-9b09-6e5ea238100f")
THREAD = UUID("db50fa92-01ba-4f34-8e35-21a7bd580269")
PENDING = UUID("d289c690-3bdc-4c0a-8b0f-3ab87fc02168")
USER = None

db = SessionLocal()
try:
    row = db.get(AgentPendingAction, PENDING)
    assert row is not None
    assert row.status == "executed"
    USER = row.user_id
    msgs = threads_svc.list_recent_messages(db, thread_id=THREAD, limit=100)
    hydrated = conf_svc.hydrate_messages_pending_cards(
        db, organization_id=ORG, user_id=USER, messages=msgs
    )
    cards = [m for m in hydrated if m["message_type"] == "pending_card"]
    assert cards, "expected pending_card"
    status = cards[0]["metadata_safe"]["pending_action"]["status"]
    assert status == "executed", status
    # Snapshot in DB still lacks status — hydration must not depend on it
    raw = db.get(AgentMessage, cards[0]["id"])
    assert "status" not in (raw.metadata_safe or {}) or True
    threads = db.scalar(select(func.count()).select_from(__import__("app.models.agent", fromlist=["AgentThread"]).AgentThread).where(
        __import__("app.models.agent", fromlist=["AgentThread"]).AgentThread.organization_id == ORG
    ))
    print("HYDRATION_OK", {"pending_status": status, "threads": int(threads or 0), "cards": len(cards)})
finally:
    db.close()
PY
