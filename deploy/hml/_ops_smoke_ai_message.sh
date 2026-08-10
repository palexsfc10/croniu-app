#!/usr/bin/env bash
set -euo pipefail
API=http://127.0.0.1:18080
SUFFIX=$(date +%s)
EMAIL="ai_smoke2_${SUFFIX}@example.com"
PASS="SenhaForte1!"
curl -sS -c /tmp/ai-smoke2.txt -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"AI Smoke2\",\"organization_name\":\"AI Org2 ${SUFFIX}\"}" \
  -o /tmp/ai-reg2.json -w 'reg=%{http_code}\n' "${API}/api/v1/auth/register"
curl -sS -b /tmp/ai-smoke2.txt -H 'Content-Type: application/json' -d '{}' \
  -o /tmp/ai-thread2.json -w 'thread=%{http_code}\n' "${API}/api/v1/agent/threads"
TID=$(python3 -c 'import json; print(json.load(open("/tmp/ai-thread2.json"))["id"])')
curl -sS -b /tmp/ai-smoke2.txt -H 'Content-Type: application/json' \
  -d '{"message":"Resuma meu dia.","input_modality":"text"}' \
  -o /tmp/ai-send2.json -w 'send=%{http_code}\n' "${API}/api/v1/agent/threads/${TID}/messages"
python3 - <<'PY'
import json
d=json.load(open("/tmp/ai-send2.json"))
print(json.dumps(d, ensure_ascii=False)[:800])
PY
# also legacy chat
curl -sS -b /tmp/ai-smoke2.txt -H 'Content-Type: application/json' \
  -d '{"message":"Quem precisa renovar?","input_modality":"text"}' \
  -o /tmp/ai-chat.json -w 'chat=%{http_code}\n' "${API}/api/v1/agent/chat"
python3 - <<'PY'
import json
d=json.load(open("/tmp/ai-chat.json"))
print(json.dumps(d, ensure_ascii=False)[:800])
PY
echo SMOKE2_DONE
