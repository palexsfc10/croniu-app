#!/usr/bin/env bash
# HML smoke: Mais UX + feedback persist + admin status (no mailto).
set -euo pipefail
API="${API_BASE:-http://127.0.0.1:18080}"
COOKIE=/tmp/croniu_mais_fb_cookies.txt
ADMIN_COOKIE=/tmp/croniu_mais_admin_cookies.txt
rm -f "$COOKIE" "$ADMIN_COOKIE"
EMAIL="mais_fb_$(date +%s)@example.com"
PASS='SenhaForte1!'

curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"full_name\":\"Mais FB\",\"organization_name\":\"Mais FB $(date +%s)\"}" \
  "$API/api/v1/auth/register" >/dev/null
curl -sS -c "$COOKIE" -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$API/api/v1/auth/login" >/dev/null

echo "== feedback create =="
curl -sS -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"category":"suggestion","subject":"Smoke HML","message":"Sugestão de teste do redesign Mais e feedback interno no HML.","include_technical_context":true,"technical_context":{"route":"/app/help","device_kind":"mobile","viewport":"390x844","client_mode":"browser","app_version":"hml"}}' \
  "$API/api/v1/feedback" -o /tmp/mais_fb.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_fb.json"))
assert d.get("status")=="new" and d.get("id"), d
open("/tmp/mais_fb_id.txt","w").write(d["id"])
print("feedback_id", d["id"])
PY

echo "== unauthenticated rejected =="
code=$(curl -sS -o /tmp/mais_fb_unauth.json -w "%{http_code}" -H 'Content-Type: application/json' \
  -d '{"category":"suggestion","message":"Tentativa sem sessão autenticada no feedback."}' \
  "$API/api/v1/feedback")
echo "unauth_http=$code"
[[ "$code" == "401" || "$code" == "403" ]]

echo "== web HTML has no mailto / support email =="
# Public login page sample; authenticated HTML via app routes not SSR-heavy
curl -sS https://croniu-hml.ntws.cloud/login -o /tmp/mais_login.html || true
python3 - <<'PY'
html=open("/tmp/mais_login.html",encoding="utf-8",errors="ignore").read().lower()
assert "mailto:" not in html
assert "appcroniu@gmail.com" not in html
print("login_html_clean=ok")
PY

echo "== admin list + status (if admin creds in env) =="
ENV=/home/palex/ntws/croniu-hml/deploy/hml/.env.hml
set -a; source "$ENV"; set +a
ADMIN_EMAIL="${PLATFORM_ADMIN_EMAIL:-${ADMIN_EMAIL:-}}"
ADMIN_PASS="${PLATFORM_ADMIN_PASSWORD:-${ADMIN_PASSWORD:-}}"
if [[ -n "${ADMIN_EMAIL}" && -n "${ADMIN_PASS}" ]]; then
  curl -sS -c "$ADMIN_COOKIE" -b "$ADMIN_COOKIE" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
    "$API/api/v1/platform/auth/login" -o /tmp/mais_admin_login.json
  curl -sS -b "$ADMIN_COOKIE" "$API/api/v1/platform/feedbacks?page_size=5" -o /tmp/mais_admin_list.json
  python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_admin_list.json"))
assert "items" in d, d
print("admin_total", d.get("total"), "items", len(d.get("items") or []))
fid=open("/tmp/mais_fb_id.txt").read().strip()
assert any(i.get("id")==fid for i in d.get("items") or []), "feedback missing in admin list"
PY
  FID=$(cat /tmp/mais_fb_id.txt)
  curl -sS -b "$ADMIN_COOKIE" -H 'Content-Type: application/json' \
    -d '{"status":"reviewing"}' \
    "$API/api/v1/platform/feedbacks/$FID" -o /tmp/mais_admin_patch.json
  python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_admin_patch.json"))
assert d.get("status")=="reviewing", d
print("admin_status", d["status"])
PY
else
  echo "admin_creds_missing=skip_admin_smoke"
fi

echo "== billing entitlement still reachable =="
curl -sS -b "$COOKIE" "$API/api/v1/billing/entitlement" -o /tmp/mais_bill.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/mais_bill.json"))
assert "has_active_access" in d or "code" in d, d
print("billing_ok", list(d.keys())[:6])
PY

echo SMOKE_MAIS_FEEDBACK_DONE
