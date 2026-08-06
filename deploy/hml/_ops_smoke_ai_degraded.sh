#!/usr/bin/env bash
set -euo pipefail
API=http://127.0.0.1:18080
SUFFIX=$(date +%s)
EMAIL="ai_smoke_${SUFFIX}@example.com"
PASS="SenhaForte1!"

curl -sS -c /tmp/ai-smoke.txt -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"AI Smoke\",\"organization_name\":\"AI Org ${SUFFIX}\"}" \
  -o /tmp/ai-reg.json -w 'reg=%{http_code}\n' "${API}/api/v1/auth/register"

python3 - <<'PY'
import json
d=json.load(open("/tmp/ai-reg.json"))
print("reg_keys", sorted(d.keys()))
print("has_organization", "organization" in d)
print("has_organization_id", "organization_id" in d)
if "organization" in d and isinstance(d["organization"], dict):
    print("org_nested_id", bool(d["organization"].get("id")))
PY

curl -sS -b /tmp/ai-smoke.txt -o /tmp/ai-status.json -w 'status=%{http_code}\n' "${API}/api/v1/agent/status"
python3 - <<'PY'
import json
d=json.load(open("/tmp/ai-status.json"))
safe = {k: d.get(k) for k in sorted(d) if "key" not in k.lower() and "token" not in k.lower()}
print(json.dumps(safe, ensure_ascii=False))
PY

curl -sS -b /tmp/ai-smoke.txt -H 'Content-Type: application/json' -d '{}' \
  -o /tmp/ai-thread.json -w 'thread=%{http_code}\n' "${API}/api/v1/agent/threads"
TID=$(python3 -c 'import json; print(json.load(open("/tmp/ai-thread.json")).get("id",""))')
echo "thread_id_present=$([ -n "$TID" ] && echo yes || echo no)"

curl -sS -b /tmp/ai-smoke.txt -H 'Content-Type: application/json' \
  -d '{"content":"Resuma meu dia."}' \
  -o /tmp/ai-send.json -w 'send=%{http_code}\n' "${API}/api/v1/agent/threads/${TID}/messages"
python3 - <<'PY'
import json
d=json.load(open("/tmp/ai-send.json"))
if isinstance(d, dict):
    print("send_keys", sorted(d.keys()))
    print("detail_or_code", d.get("detail") or d.get("code") or d.get("error_code") or d.get("message"))
    print("enabled", d.get("enabled"), "ai_enabled", d.get("ai_enabled"))
else:
    print(d)
PY

echo "=== shared services ==="
systemctl is-active smbd 2>/dev/null || echo smbd=unknown
systemctl is-active unifi 2>/dev/null || systemctl is-active unifi-core 2>/dev/null || echo unifi=unknown
echo "kyvora_containers=$(docker ps --format '{{.Names}}' | grep -c kyvora || true)"
echo SMOKE_DONE
