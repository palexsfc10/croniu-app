#!/usr/bin/env bash
# API + static marker smoke for assistant premium UI (HML).
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
WEB="${WEB_BASE:-http://127.0.0.1:13000}"
SUFFIX=$(date +%s)
EMAIL="asst_ui_${SUFFIX}@example.com"
PASS='SenhaForte1!'
NAME="Pedro Smoke${SUFFIX}"
COOKIE=/tmp/asst_ui_smoke.txt
rm -f "$COOKIE"

echo "== register =="
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"${NAME}\",\"organization_name\":\"Asst UI Org ${SUFFIX}\"}" \
  -o /tmp/asst_ui_reg.json -w 'reg=%{http_code}\n' "${API}/api/v1/auth/register"

echo "== me =="
curl -sS -b "$COOKIE" -o /tmp/asst_ui_me.json -w 'me=%{http_code}\n' "${API}/api/v1/auth/me"
python3 - <<'PY'
import json
me=json.load(open("/tmp/asst_ui_me.json"))
fn=me["user"]["full_name"]
tz=me.get("organization",{}).get("timezone") or "America/Sao_Paulo"
first=fn.strip().split()[0]
print(f"first_name={first}")
print(f"timezone={tz}")
assert first.startswith("Pedro"), first
PY

echo "== thread + meu dia =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' -d '{}' \
  -o /tmp/asst_ui_thread.json -w 'thread=%{http_code}\n' "${API}/api/v1/agent/threads"
TID=$(python3 -c 'import json; print(json.load(open("/tmp/asst_ui_thread.json"))["id"])')
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"message":"Como está meu dia?","input_modality":"text"}' \
  -o /tmp/asst_ui_msg.json -w 'msg=%{http_code}\n' "${API}/api/v1/agent/threads/${TID}/messages"
python3 - <<'PY'
import json
d=json.load(open("/tmp/asst_ui_msg.json"))
assert "reply" in d and d["reply"], d
print("reply_ok", d["reply"][:160].replace("\n"," "))
print("status", d.get("status"))
print("pending", bool(d.get("pending_action")))
PY

echo "== second suggestion style prompt =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"message":"Quero criar um compromisso","input_modality":"text"}' \
  -o /tmp/asst_ui_msg2.json -w 'msg2=%{http_code}\n' "${API}/api/v1/agent/threads/${TID}/messages"
python3 - <<'PY'
import json
d=json.load(open("/tmp/asst_ui_msg2.json"))
print("reply2_ok", (d.get("reply") or "")[:160].replace("\n"," "))
print("pending2", bool(d.get("pending_action")))
PY

echo "== web pages =="
curl -sS -o /dev/null -w 'assistant=%{http_code}\n' "${WEB}/app/assistant"
curl -sS -o /dev/null -w 'preferences=%{http_code}\n' "${WEB}/app/preferences"
curl -sS -o /dev/null -w 'public_assistant=%{http_code}\n' https://croniu-hml.ntws.cloud/app/assistant || true

echo "== static markers =="
docker exec croniu-hml-web sh -c 'grep -Rsl "Meu dia" /app/.next/static 2>/dev/null | head -2'
docker exec croniu-hml-web sh -c 'grep -Rsl "Enviar voz automaticamente: ligado" /app/.next/static 2>/dev/null | head -1 || echo AUTO_SEND_LABEL_ABSENT'
docker exec croniu-hml-web sh -c 'grep -Rsl "Assistente Croniu" /app/.next/static 2>/dev/null | head -1 || echo ASSISTENTE_CRONIU_ABSENT'

echo SMOKE_ASSISTANT_PREMIUM_UI_DONE
