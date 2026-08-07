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

curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$CID\",\"starts_at\":\"2026-08-20T22:00:00Z\",\"ends_at\":\"2026-08-20T23:00:00Z\",\"title\":\"Bloqueio\"}" \
  -o /tmp/ca_block.json -w 'block=%{http_code}\n' "${API}/api/v1/appointments"

docker cp /tmp/_ops_smoke_cycle_agenda_inner.py croniu-hml-api:/tmp/smoke_cycle_agenda_inner.py
docker exec \
  -e CA_ORG="$ORG" -e CA_USER="$USER" -e CA_CID="$CID" -e CA_SID="$SID" -e CA_TID="$TID" \
  -e PYTHONPATH=/app \
  croniu-hml-api python /tmp/smoke_cycle_agenda_inner.py

curl -sS -b "$COOKIE" "${API}/api/v1/agenda/day?on=2026-08-11" -o /tmp/ca_day.json -w 'day=%{http_code}\n'
python3 - <<'PY'
import json
d=json.load(open("/tmp/ca_day.json"))
appts=d.get("appointments") or d.get("items") or []
print("day_count", len(appts))
titles=[a.get("title") for a in appts]
print("titles", titles[:5])
assert any(t and "Gabriel" in t for t in titles), titles
print("AGENDA_DAY_OK")
PY

echo SMOKE_HOST_DONE
