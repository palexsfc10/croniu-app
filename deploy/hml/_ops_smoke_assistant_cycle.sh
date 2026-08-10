#!/usr/bin/env bash
# HML smoke: create client → cycle for "ele" with Aula padrão → ask only start date → confirm.
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
COOKIE=/tmp/croniu_cycle_smoke_cookies.txt
rm -f "$COOKIE"
EMAIL="cycle_ai_$(date +%s)@example.com"
PASS='SenhaForte1!'
PHONE="1197$(date +%s | tail -c 7)"

curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"full_name\":\"Cycle AI\",\"organization_name\":\"Cycle AI $(date +%s)\"}" \
  "$API/api/v1/auth/register" >/dev/null
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$API/api/v1/auth/login" >/dev/null

curl -sS -b "$COOKIE" -X PATCH -H 'Content-Type: application/json' \
  -d '{"timezone":"America/Sao_Paulo"}' \
  "$API/api/v1/organization/preferences" >/dev/null

# Seed service + template (Aula padrão)
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Aula padrão","default_duration_minutes":60,"default_duration_days":30,"default_price_cents":30000}' \
  "$API/api/v1/services" -o /tmp/cyc_svc.json
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Aula padrão","weekly_frequency":2,"duration_type":"fixed_days","duration_value":30}' \
  "$API/api/v1/cycle-templates" -o /tmp/cyc_tmpl.json
python3 - <<'PY'
import json
print("service", json.load(open("/tmp/cyc_svc.json")).get("name"), json.load(open("/tmp/cyc_svc.json")).get("default_price_cents"))
print("template_freq", json.load(open("/tmp/cyc_tmpl.json")).get("weekly_frequency"))
PY

curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{"title":"ciclo jose"}' \
  "$API/api/v1/agent/threads" -o /tmp/cyc_thread.json
TID=$(python3 -c 'import json; print(json.load(open("/tmp/cyc_thread.json"))["id"])')

chat() {
  local msg="$1" out="$2" modality="${3:-text}"
  local cid
  cid=$(python3 -c 'import uuid; print(uuid.uuid4())')
  python3 - <<PY > /tmp/cyc_payload.json
import json
print(json.dumps({
  "message": """$msg""",
  "input_modality": "$modality",
  "client_message_id": "$cid",
}))
PY
  curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -H "X-Request-Id: $cid" \
    -d @/tmp/cyc_payload.json \
    "$API/api/v1/agent/threads/$TID/messages" -o "$out"
}

echo "== 1) cadastrar José =="
chat "Cadastre José da Silva, telefone $PHONE." /tmp/cyc_1.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_1.json"))
print("status", d.get("status"), "pending", bool(d.get("pending_action")), "tools", d.get("tool_trace"))
print("reply", (d.get("reply") or "")[:180].replace("\n"," "))
pa=d.get("pending_action") or {}
open("/tmp/cyc_pending1.txt","w").write(pa.get("id") or "")
PY
PID1=$(cat /tmp/cyc_pending1.txt)
[[ -n "$PID1" ]] || { echo "FAIL: expected client propose"; exit 1; }
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{}' \
  "$API/api/v1/agent/pending/$PID1/confirm" -o /tmp/cyc_1c.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_1c.json"))
print("confirm_client", d.get("action_status"), d.get("result",{}).get("id"), d.get("result",{}).get("full_name"))
assert d.get("action_status")=="executed"
assert d.get("result",{}).get("full_name")=="José da Silva"
PY

echo "== 2) crie ciclo para ele (Aula padrão, 2x) =="
chat "Agora crie um ciclo para ele usando a Aula padrão, duas vezes por semana." /tmp/cyc_2.json
python3 - <<'PY'
import json,re
d=json.load(open("/tmp/cyc_2.json"))
print("status", d.get("status"), "tools", d.get("tool_trace"))
print("reply", (d.get("reply") or "")[:320].replace("\n"," "))
tools=" ".join(d.get("tool_trace") or [])
assert "prepare_cycle_proposal" in tools or "find_services" in tools or "get_service_defaults" in tools, tools
# Should ask for start date OR already propose if model invents today — either ok if not form questionnaire
reply=(d.get("reply") or "").lower()
bad = sum(1 for k in ["qual o valor","quantas aulas","duração do ciclo","qual a frequência"] if k in reply)
print("questionnaire_hits", bad)
assert bad == 0, "assistant asked fields already known"
open("/tmp/cyc_pending2.txt","w").write((d.get("pending_action") or {}).get("id") or "")
PY

# If asked for date, answer "Começa hoje"
if [[ -z "$(cat /tmp/cyc_pending2.txt)" ]]; then
  echo "== 3) responde começa hoje =="
  chat "Começa hoje." /tmp/cyc_3.json
  python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_3.json"))
print("status", d.get("status"), "tools", d.get("tool_trace"))
print("reply", (d.get("reply") or "")[:320].replace("\n"," "))
pa=d.get("pending_action") or {}
open("/tmp/cyc_pending2.txt","w").write(pa.get("id") or "")
fields=pa.get("summary_fields") or {}
print("fields", fields)
assert pa.get("id"), "expected cycle proposal"
assert "Frequência" in fields or "frequência" in (pa.get("summary") or "").lower() or "aula" in (pa.get("summary") or "").lower()
args=pa.get("arguments") or {}
assert args.get("weekly_frequency")==2, args
assert not (args.get("notes") or "").lower().startswith("duas"), args.get("notes")
PY
else
  python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_2.json"))
pa=d.get("pending_action") or {}
fields=pa.get("summary_fields") or {}
print("early_proposal_fields", fields)
args=pa.get("arguments") or {}
assert args.get("weekly_frequency")==2, args
PY
fi

PID2=$(cat /tmp/cyc_pending2.txt)
[[ -n "$PID2" ]] || { echo "FAIL: expected cycle propose"; exit 1; }

echo "== 4) confirm cycle =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{}' \
  "$API/api/v1/agent/pending/$PID2/confirm" -o /tmp/cyc_4.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_4.json"))
print("confirm_cycle", d.get("action_status"), d.get("result"))
assert d.get("action_status")=="executed"
assert d.get("result",{}).get("kind")=="cycle"
open("/tmp/cyc_cycle_id.txt","w").write(d["result"]["id"])
PY
CID=$(cat /tmp/cyc_cycle_id.txt)

echo "== 5) idempotent reconfirm =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{}' \
  "$API/api/v1/agent/pending/$PID2/confirm" -o /tmp/cyc_5.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_5.json"))
print("idempotent_replay", d.get("idempotent_replay"), "status", d.get("action_status"))
assert d.get("idempotent_replay") is True
assert d.get("result",{}).get("id")==open("/tmp/cyc_cycle_id.txt").read().strip()
PY

echo "== 6) validate cycle on API =="
curl -sS -b "$COOKIE" "$API/api/v1/cycles/$CID" -o /tmp/cyc_cycle.json
python3 - <<'PY'
import json
c=json.load(open("/tmp/cyc_cycle.json"))
print("cycle", c.get("service_name"), c.get("weekly_frequency"), c.get("lesson_count"), c.get("value_cents"), c.get("starts_on"), c.get("ends_on"), c.get("is_legacy"))
assert c.get("weekly_frequency")==2
assert c.get("lesson_count")==8
assert c.get("value_cents")==30000
assert c.get("is_legacy") is False
PY

echo "== 7) correction scenario (new thread) =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{"title":"ciclo corrige"}' \
  "$API/api/v1/agent/threads" -o /tmp/cyc_t2.json
TID=$(python3 -c 'import json; print(json.load(open("/tmp/cyc_t2.json"))["id"])')
# second client
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"full_name":"Maria Teste","phone":"11990001122"}' "$API/api/v1/clients" >/dev/null
chat "Prepare um ciclo da Aula padrão para Maria Teste começando amanhã, duas vezes por semana." /tmp/cyc_7a.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_7a.json"))
print("prep_status", d.get("status"), "tools", d.get("tool_trace"), "pending", bool(d.get("pending_action")))
open("/tmp/cyc_pending7.txt","w").write((d.get("pending_action") or {}).get("id") or "")
PY
if [[ -z "$(cat /tmp/cyc_pending7.txt)" ]]; then
  chat "Pode propor." /tmp/cyc_7b.json
  python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_7b.json"))
open("/tmp/cyc_pending7.txt","w").write((d.get("pending_action") or {}).get("id") or "")
print("second_try_pending", bool(open("/tmp/cyc_pending7.txt").read().strip()))
PY
fi
OLD=$(cat /tmp/cyc_pending7.txt)
if [[ -n "$OLD" ]]; then
  chat "Na verdade são três vezes por semana." /tmp/cyc_7c.json
  python3 - <<'PY'
import json
d=json.load(open("/tmp/cyc_7c.json"))
pa=d.get("pending_action") or {}
print("corrected_pending", pa.get("id"), "args_freq", (pa.get("arguments") or {}).get("weekly_frequency"))
# Old pending should be superseded (cancelled) when new propose created
PY
  curl -sS -b "$COOKIE" "$API/api/v1/agent/threads/$TID/pending?status=cancelled" -o /tmp/cyc_cancelled.json || true
fi

echo SMOKE_ASSISTANT_CYCLE_DONE
