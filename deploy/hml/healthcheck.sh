#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.hml"

die() { printf '[croniu-hml-health] ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[croniu-hml-health] %s\n' "$*"; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${API_HOST_PORT:?}"
: "${WEB_HOST_PORT:?}"
: "${ADMIN_HOST_PORT:?}"

API="http://127.0.0.1:${API_HOST_PORT}"
WEB="http://127.0.0.1:${WEB_HOST_PORT}"
ADMIN="http://127.0.0.1:${ADMIN_HOST_PORT}"

check() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -s -o /tmp/croniu-hml-health.out -w '%{http_code}' "$url" || true)"
  [[ "$code" =~ ^2 ]] || die "$name falhou ($code) em $url"
  log "OK $name ($code)"
}

check "web" "$WEB/"
check "admin" "$ADMIN/"
check "api-health" "$API/health"
check "openapi" "$API/openapi.json"
check "manifest" "$WEB/manifest.webmanifest"

SUFFIX="$(date +%s)"
EMAIL="smoke_${SUFFIX}@example.com"
PASS="SenhaForte1!"

REG="$(curl -s -c /tmp/croniu-hml-cookies.txt -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"Smoke HML\",\"organization_name\":\"Org ${SUFFIX}\"}" \
  -w '%{http_code}' -o /tmp/croniu-hml-reg.json \
  "${API}/api/v1/auth/register")"
[[ "$REG" == "201" ]] || die "cadastro falhou ($REG)"
log "OK register"

ME="$(curl -s -b /tmp/croniu-hml-cookies.txt -o /tmp/croniu-hml-me.json -w '%{http_code}' "${API}/api/v1/auth/me")"
[[ "$ME" == "200" ]] || die "me falhou ($ME)"
log "OK me"

ANON="$(curl -s -o /dev/null -w '%{http_code}' "${API}/api/v1/auth/me")"
[[ "$ANON" == "401" ]] || die "anonimo deveria ser 401 ($ANON)"
log "OK anonymous blocked"

LOGOUT="$(curl -s -b /tmp/croniu-hml-cookies.txt -c /tmp/croniu-hml-cookies.txt \
  -X POST -o /dev/null -w '%{http_code}' "${API}/api/v1/auth/logout")"
[[ "$LOGOUT" == "200" ]] || die "logout falhou ($LOGOUT)"
log "OK logout"

AFTER="$(curl -s -b /tmp/croniu-hml-cookies.txt -o /dev/null -w '%{http_code}' "${API}/api/v1/auth/me")"
[[ "$AFTER" == "401" ]] || die "sessao deveria invalidar ($AFTER)"
log "OK session revoked"

# Tenant isolation smoke
EMAIL_B="smoke_b_${SUFFIX}@example.com"
curl -s -c /tmp/croniu-hml-a.txt -H 'Content-Type: application/json' \
  -d "{\"email\":\"a_${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"A\",\"organization_name\":\"OrgA ${SUFFIX}\"}" \
  "${API}/api/v1/auth/register" >/tmp/croniu-hml-a.json
ORG_A="$(python3 -c "import json;print(json.load(open('/tmp/croniu-hml-a.json'))['organization']['id'])")"
curl -s -c /tmp/croniu-hml-b.txt -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL_B}\",\"password\":\"${PASS}\",\"full_name\":\"B\",\"organization_name\":\"OrgB ${SUFFIX}\"}" \
  "${API}/api/v1/auth/register" >/tmp/croniu-hml-b.json
SUMMARY_B="$(curl -s -b /tmp/croniu-hml-b.txt "${API}/api/v1/home/summary")"
ORG_B="$(python3 -c "import json,sys;print(json.load(sys.stdin)['organization_id'])" <<<"$SUMMARY_B")"
[[ "$ORG_A" != "$ORG_B" ]] || die "isolamento falhou: mesmas orgs"
log "OK tenant isolation"

# Billing entitlement smoke (trial on register; callback ≠ paid)
curl -s -c /tmp/croniu-hml-bill.txt -H 'Content-Type: application/json' \
  -d "{\"email\":\"bill_${EMAIL}\",\"password\":\"${PASS}\",\"full_name\":\"Bill\",\"organization_name\":\"OrgBill ${SUFFIX}\"}" \
  "${API}/api/v1/auth/register" >/tmp/croniu-hml-bill-reg.json
ENT="$(curl -s -b /tmp/croniu-hml-bill.txt -o /tmp/croniu-hml-ent.json -w '%{http_code}' \
  "${API}/api/v1/billing/entitlement")"
[[ "$ENT" == "200" ]] || die "billing entitlement falhou ($ENT)"
python3 - <<'PY'
import json
ent = json.load(open("/tmp/croniu-hml-ent.json"))
assert ent.get("has_active_access") is True, ent
assert ent.get("subscription_status") in ("trialing", "trial"), ent
assert (ent.get("payment_status") in (None, "none", "")), ent
assert ent.get("billing_setup_status"), ent
print("entitlement ok", ent.get("subscription_status"), ent.get("billing_setup_status"))
PY
log "OK billing entitlement (trial)"

STATUS="$(curl -s -b /tmp/croniu-hml-bill.txt -o /tmp/croniu-hml-bill-status.json -w '%{http_code}' \
  "${API}/api/v1/billing/status")"
[[ "$STATUS" == "200" ]] || die "billing status falhou ($STATUS)"
python3 - <<'PY'
import json, os
st = json.load(open("/tmp/croniu-hml-bill-status.json"))
card = st.get("card_enabled")
# Prefer env guard; status should reflect card=false until homologation
env_card = os.environ.get("BILLING_CARD_ENABLED", "false").lower()
if env_card in ("0", "false", "no", ""):
    assert card is False, st
print("billing status ok card_enabled=", card)
PY
log "OK billing status (card guard)"

# Shared services must remain up (read-only checks)
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active smbd >/dev/null 2>&1 && log "OK samba active" || log "WARN samba status unknown"
  systemctl is-active unifi >/dev/null 2>&1 && log "OK unifi active" || \
    systemctl is-active unifi-core >/dev/null 2>&1 && log "OK unifi-core active" || \
    log "WARN unifi status unknown (verifique manualmente)"
fi

log "Todos os smokes técnicos passaram"
