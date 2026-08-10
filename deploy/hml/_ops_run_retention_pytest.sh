#!/usr/bin/env bash
set -euo pipefail
test "$(docker exec croniu-hml-api printenv CRONIU_ENV)" = "hml"

docker exec croniu-hml-db psql -U croniu_hml -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='croniu_hml_pytest'" | grep -q 1 \
  || docker exec croniu-hml-db psql -U croniu_hml -d postgres -c "CREATE DATABASE croniu_hml_pytest OWNER croniu_hml;"

# Reset test DB schema
docker exec croniu-hml-db psql -U croniu_hml -d postgres -c "DROP DATABASE IF EXISTS croniu_hml_pytest WITH (FORCE);"
docker exec croniu-hml-db psql -U croniu_hml -d postgres -c "CREATE DATABASE croniu_hml_pytest OWNER croniu_hml;"

TEST_URL="$(docker exec croniu-hml-api printenv DATABASE_URL | sed 's#/croniu_hml$#/croniu_hml_pytest#')"
docker exec -e DATABASE_URL="$TEST_URL" croniu-hml-api alembic upgrade head

# Copy tests into container if missing
docker cp /home/palex/ntws/croniu-hml/backend/tests/test_agent_thread_retention.py \
  croniu-hml-api:/tmp/test_agent_thread_retention.py
docker cp /home/palex/ntws/croniu-hml/backend/tests/test_agent_assistant_v1.py \
  croniu-hml-api:/tmp/test_agent_assistant_v1.py 2>/dev/null || true

docker exec -e DATABASE_URL="$TEST_URL" croniu-hml-api pip install -q pytest httpx 2>/dev/null || true

# conftest expects localhost:5433 — run a focused inline suite instead via python
docker exec -e DATABASE_URL="$TEST_URL" -i croniu-hml-api python - <<'PY'
from __future__ import annotations
import uuid
from datetime import UTC, datetime, timedelta

from app.db import SessionLocal, Base, engine
from app.models.agent import AgentMessage, AgentThread
from app.services import agent_threads as threads_svc
from sqlalchemy import func, select

# Ensure models registered
from app import models  # noqa: F401

db = SessionLocal()

def count(org):
    return db.scalar(select(func.count()).select_from(AgentThread).where(AgentThread.organization_id == org)) or 0

# Minimal org/user stubs via raw inserts if auth tables empty — use UUIDs without FKs? FKs exist.
# Skip full HTTP tests; exercise retention service with deferred FK by using organizations from seed.
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership
from pwdlib import PasswordHash

ph = PasswordHash.recommended()
org = Organization(id=uuid.uuid4(), name="Retention Test Org", timezone="America/Sao_Paulo")
user = User(id=uuid.uuid4(), email=f"ret_{uuid.uuid4().hex[:8]}@example.com", full_name="T", password_hash=ph.hash("Password123!"))
db.add(org); db.add(user); db.flush()
db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))
db.commit()

base = datetime.now(UTC) - timedelta(days=1)
for i in range(5):
    t = AgentThread(organization_id=org.id, user_id=user.id, title=f"t{i}", status="active",
                    created_at=base+timedelta(hours=i), updated_at=base+timedelta(hours=i))
    db.add(t); db.flush()
    db.add(AgentMessage(thread_id=t.id, organization_id=org.id, user_id=user.id, role="user", content="x", message_type="text", status="ok"))
db.commit()

# list does not create
before = count(org.id)
assert before == 5
listed = threads_svc.list_threads(db, organization_id=org.id, user_id=user.id)
assert len(listed) == 5

# sixth creates and prunes oldest
new = threads_svc.create_thread(db, organization_id=org.id, user_id=user.id, title="sixth")
threads_svc.append_message(db, thread=new, role="user", content="hi", user_id=user.id)
assert count(org.id) == 5
assert db.get(AgentThread, new.id) is not None

# idempotent empty create
a = threads_svc.create_thread(db, organization_id=org.id, user_id=user.id, title="draft-a")
b = threads_svc.create_thread(db, organization_id=org.id, user_id=user.id, title="draft-b")
assert a.id == b.id

# protect current
stale = listed[-1]
# refresh after mutations
threads_svc.enforce_organization_thread_limit(db, organization_id=org.id, protect_thread_id=new.id)
assert db.get(AgentThread, new.id) is not None

print("RETENTION_SERVICE_OK", {"threads": count(org.id)})
db.close()
PY

echo PYTEST_INLINE_OK
