#!/usr/bin/env bash
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
ADMIN_EMAIL="hml-feedback-admin@example.com"
ADMIN_PASS='HmlFeedbackAdmin1!'
FID=$(cat /tmp/mais_fb_id.txt)

docker exec -e PLATFORM_ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e PLATFORM_ADMIN_FULL_NAME="HML Feedback Admin" \
  -e PLATFORM_ADMIN_PASSWORD="$ADMIN_PASS" \
  croniu-hml-api python -m app.cli.create_platform_admin

COOKIE=/tmp/croniu_mais_admin_cookies2.txt
rm -f "$COOKIE"
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  "$API/api/v1/platform/auth/login" -o /tmp/mais_admin_login.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_admin_login.json"))
assert d.get("role")=="platform_admin", d
print("admin_login_ok", d.get("email"))
PY

curl -sS -b "$COOKIE" "$API/api/v1/platform/feedbacks?page_size=10" -o /tmp/mais_admin_list.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_admin_list.json"))
fid=open("/tmp/mais_fb_id.txt").read().strip()
assert any(i.get("id")==fid for i in d.get("items") or []), d
item=next(i for i in d["items"] if i["id"]==fid)
print("admin_found", item["category"], item["status"], bool(item.get("technical_context")))
PY

curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"status":"reviewing"}' \
  "$API/api/v1/platform/feedbacks/$FID" -o /tmp/mais_admin_patch.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_admin_patch.json"))
assert d.get("status")=="reviewing", d
print("admin_status_updated", d["status"])
PY
echo SMOKE_ADMIN_FEEDBACK_DONE
