#!/usr/bin/env bash
# Smoke HML: cycle schedule ask → conflict → create 8 appointments → idempotent.
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
SUFFIX=$(date +%s)
EMAIL="cycle_agenda_${SUFFIX}@example.com"
PASS='SenhaForte1!'
COOKIE=/tmp/cycle_agenda_smoke.txt
rm -f "$COOKIE"

echo "== register =="
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"Pedro Agenda\",\"organization_name\":\"Agenda Org ${SUFFIX}\"}" \
  -o /tmp/ca_reg.json -w 'reg=%{http_code}\n' "${API}/api/v1/auth/register"
ORG=$(python3 -c 'import json; print(json.load(open("/tmp/ca_reg.json"))["organization"]["id"])')
USER=$(python3 -c 'import json; print(json.load(open("/tmp/ca_reg.json"))["user"]["id"])')

echo "== seed gabriel + aula =="
CID=$(curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"full_name":"Gabriel Silva","phone":"11970007000"}' "${API}/api/v1/clients" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SID=$(curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Aula padrão","default_duration_minutes":60,"default_duration_days":30,"default_price_cents":9000}' \
  "${API}/api/v1/services" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
TID=$(curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Aula padrão","weekly_frequency":2,"duration_type":"fixed_days","duration_value":30}' \
  "${API}/api/v1/cycle-templates" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

# Block Thu 20 Aug 2026 19:00-20:00 America/Sao_Paulo = 22:00-23:00Z (no DST in 2026 BR)
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$CID\",\"starts_at\":\"2026-08-20T22:00:00Z\",\"ends_at\":\"2026-08-20T23:00:00Z\",\"title\":\"Bloqueio\"}" \
  -o /tmp/ca_block.json -w 'block=%{http_code}\n' "${API}/api/v1/appointments"

export CA_ORG="$ORG" CA_USER="$USER" CA_CID="$CID" CA_SID="$SID" CA_TID="$TID"
docker exec -e CA_ORG -e CA_USER -e CA_CID -e CA_SID -e CA_TID croniu-hml-api python - <<'PY'
import os, uuid
from datetime import date
from app.db import SessionLocal
from app.agent import cycle_prepare as prep
from app.agent.tools import ToolContext, execute_create_cycle, get_tool
from app.services.auth import AuthError

org = uuid.UUID(os.environ["CA_ORG"])
user = uuid.UUID(os.environ["CA_USER"])
cid = uuid.UUID(os.environ["CA_CID"])
sid = uuid.UUID(os.environ["CA_SID"])
tid = uuid.UUID(os.environ["CA_TID"])
db = SessionLocal()
try:
    # 1) asks for days/times
    r1 = prep.prepare_cycle_proposal(
        db, organization_id=org, client_id=cid, service_id=sid,
        starts_on=date(2026, 8, 7), weekly_frequency=2, today=date(2026, 8, 7),
    )
    assert r1.status == "need_input", r1
    assert "weekdays" in r1.payload["missing"], r1.payload
    print("ASK_SCHEDULE_OK", r1.payload["message"][:120])

    # 2) days without time
    r2 = prep.prepare_cycle_proposal(
        db, organization_id=org, client_id=cid, service_id=sid,
        starts_on=date(2026, 8, 7), weekly_frequency=2, weekdays=[1, 3],
        today=date(2026, 8, 7),
    )
    assert r2.status == "need_input" and "starts_time" in r2.payload["missing"], r2.payload
    print("ASK_TIME_OK", r2.payload["message"][:120])

    # 3) conflict at 19:00
    r3 = prep.prepare_cycle_proposal(
        db, organization_id=org, client_id=cid, service_id=sid,
        starts_on=date(2026, 8, 7), weekly_frequency=2, weekdays=[1, 3],
        starts_time="19:00", today=date(2026, 8, 7),
    )
    assert r3.status == "schedule_conflict", r3
    assert r3.payload.get("suggestions"), r3.payload
    print("CONFLICT_OK", r3.payload["message"][:160])
    print("SUGGESTIONS", r3.payload["suggestions"][:3])

    # 4) alternative free time
    alt = r3.payload["suggestions"][0].split("–")[0]
    r4 = prep.prepare_cycle_proposal(
        db, organization_id=org, client_id=cid, service_id=sid,
        starts_on=date(2026, 8, 7), weekly_frequency=2, weekdays=[1, 3],
        starts_time=alt, today=date(2026, 8, 7),
    )
    assert r4.status == "ready", r4
    draft = r4.payload["draft"]
    assert draft["creates_appointments"] is True
    assert draft["lesson_count"] == 8
    assert "Sem compromissos" not in draft["summary_lines"]["Agenda"]
    assert len(draft["occurrence_dates"]) == 8
    print("READY_OK", draft["summary_lines"]["Agenda"], "slots", draft["schedule_lines"])

    ctx = ToolContext(organization_id=org, user_id=user, db=db, today=date(2026, 8, 7))
    propose = get_tool("propose_create_cycle").handler(ctx, {
        **{k: draft[k] for k in draft if k not in {"client_name","service_name","template_name","summary_lines","planned_sessions"}},
        "cycle_template_id": str(tid),
        "generate_appointments": True,
        "idempotency_key": f"smoke-ca-{os.environ['CA_CID'][:8]}",
    })
    assert propose["needs_confirmation"] is True, propose
    assert "compromissos serão criados" in propose["summary_fields"]["Agenda"]
    print("PROPOSE_OK", propose["summary"])

    out = execute_create_cycle(ctx, propose["arguments"])
    assert out["creates_appointments"] is True
    assert out["appointment_count"] == 8
    print("CREATE_OK", out["id"], "appts", out["appointment_count"])

    out2 = execute_create_cycle(ctx, propose["arguments"])
    assert out2["id"] == out["id"]
    assert out2["appointment_count"] == 8
    print("IDEMPOTENT_OK", out2["id"])
finally:
    db.close()
print("SMOKE_CYCLE_AGENDA_DONE")
PY

# Day agenda spot-check first occurrence date from prepare (Tue 11 Aug)
curl -sS -b "$COOKIE" "${API}/api/v1/agenda/day?on=2026-08-11" -o /tmp/ca_day.json -w 'day=%{http_code}\n'
python3 - <<'PY'
import json
d=json.load(open("/tmp/ca_day.json"))
appts=d.get("appointments") or d.get("items") or []
print("day_count", len(appts))
titles=[a.get("title") for a in appts]
print("titles", titles[:5])
assert any("Gabriel" in (t or "") for t in titles), titles
print("AGENDA_DAY_OK")
PY

echo SMOKE_HOST_DONE
