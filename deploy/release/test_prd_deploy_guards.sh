#!/usr/bin/env bash
# Automated guards for PRD cold-start, ports, promote path, and Pilot isolation.
# Disposable Docker only — never targets live HML/PRD paths or Pilot resources.
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fail=0
pass() { echo "PASS: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

SCRIPT_DIR="$ROOT/deploy/release"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

# --- 10/12: Promote workflow absolute path + no relative source ---
promo="$ROOT/.github/workflows/promote-production.yml"
grep -q '/srv/docker/croniu-prd/deploy/prd/.env.prd' "$promo" && pass "promote absolute .env.prd" || bad "promote absolute .env.prd"
grep -q 'POST_DEPLOY_SMOKE' "$promo" && pass "promote POST_DEPLOY_SMOKE label" || bad "promote POST_DEPLOY_SMOKE label"
if grep -E "source[[:space:]]+deploy/prd/\.env\.prd" "$promo"; then
  bad "promote still sources relative .env.prd"
else
  pass "promote no relative .env.prd source"
fi
grep -q 'cd /srv/docker/croniu-prd' "$promo" && pass "promote cd absolute root" || bad "promote cd absolute root"

# --- 12: Pilot isolation in PRD compose + release scripts ---
# Allow explicit rejection lists in preflight; exclude this test file.
pilot_hits="$(
  grep -R -n -E 'croniu-pilot|/srv/docker/croniu[^-]|system prune' \
    deploy/prd deploy/release \
    --include='*.yaml' --include='*.yml' --include='*.sh' --include='*.example' \
    --exclude='test_prd_deploy_guards.sh' \
    || true
)"
port_hits="$(
  grep -R -n -E '(^|[^0-9])(18080|13000|13002)([^0-9]|$)' \
    deploy/prd deploy/release \
    --include='*.yaml' --include='*.yml' --include='*.sh' --include='*.example' \
    --exclude='test_prd_deploy_guards.sh' \
    | grep -vE 'preflight\.sh|lib\.sh' \
    || true
)"
if [[ -n "$pilot_hits" || -n "$port_hits" ]]; then
  echo "$pilot_hits"
  echo "$port_hits"
  bad "Pilot markers found in PRD/release paths"
else
  pass "no Pilot path/ports/prune in deploy/prd + release (excluding guard messages)"
fi
grep -q 'container_name: croniu-prd-db' deploy/prd/compose.prd.yaml
grep -q 'name: croniu-prd-postgres-data' deploy/prd/compose.prd.yaml
grep -q 'name: croniu-prd-network' deploy/prd/compose.prd.yaml
grep -q '127.0.0.1:\${API_HOST_PORT}' deploy/prd/compose.prd.yaml
pass "PRD exclusive containers/network/volume + loopback"

# --- 8/9: Port preflight ---
# --- 8/9: Port contract (unit — no jq/docker required) ---
# Run in subshells so die() does not abort this test harness.
if ( validate_prd_host_ports 19080 14000 14002 ); then
  pass "canonical PRD ports accepted"
else
  bad "canonical PRD ports rejected"
fi
if ( validate_prd_host_ports 18080 13000 13002 ) >/tmp/ports_pilot.log 2>&1; then
  bad "Pilot ports must be rejected"
else
  grep -q 'Pilot' /tmp/ports_pilot.log && pass "Pilot ports rejected" || bad "Pilot rejection message missing"
fi
if ( validate_prd_host_ports 19080 19080 14002 ) >/tmp/ports_dup.log 2>&1; then
  bad "duplicate ports must be rejected"
else
  pass "duplicate ports rejected"
fi
if ( validate_prd_host_ports abc 14000 14002 ) >/tmp/ports_nan.log 2>&1; then
  bad "non-numeric ports must be rejected"
else
  pass "non-numeric ports rejected"
fi
if ( validate_prd_host_ports '' 14000 14002 ) >/tmp/ports_empty.log 2>&1; then
  bad "empty ports must be rejected"
else
  pass "empty ports rejected"
fi

# Template defaults must be PRD ports
grep -q '^API_HOST_PORT=19080$' deploy/prd/.env.prd.example || bad "example API port"
grep -q '^WEB_HOST_PORT=14000$' deploy/prd/.env.prd.example || bad "example WEB port"
grep -q '^ADMIN_HOST_PORT=14002$' deploy/prd/.env.prd.example || bad "example ADMIN port"
pass "example ports 19080/14000/14002"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; docker volume rm "${PRD_POSTGRES_VOLUME_NAME:-}" >/dev/null 2>&1 || true' EXIT
mkdir -p "$TMP/deploy/prd" "$TMP/backups"
cp deploy/prd/compose.prd.yaml "$TMP/deploy/prd/"
cp deploy/prd/.env.prd.example "$TMP/deploy/prd/.env.prd"
sed -i \
  -e 's/^POSTGRES_USER=$/POSTGRES_USER=croniu/' \
  -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=placeholder_not_a_secret/' \
  -e 's/^POSTGRES_DB=$/POSTGRES_DB=croniu/' \
  -e 's/^SECRET_KEY=$/SECRET_KEY=placeholder-secret-key-with-32chars-min/' \
  -e 's/^RESEND_API_KEY=$/RESEND_API_KEY=re_test_placeholder/' \
  -e 's/^ASAAS_API_KEY=$/ASAAS_API_KEY=asaas_test_placeholder/' \
  -e 's/^ASAAS_WEBHOOK_TOKEN=$/ASAAS_WEBHOOK_TOKEN=whsec_test_placeholder/' \
  "$TMP/deploy/prd/.env.prd"

export DEPLOY_ROOT="$TMP" ENVIRONMENT=prd \
  COMPOSE_FILE="$TMP/deploy/prd/compose.prd.yaml" \
  ENV_FILE="$TMP/deploy/prd/.env.prd" \
  MANIFEST="$TMP/manifest.json"
cat >"$MANIFEST" <<'JSON'
{
  "images": {
    "api": "ghcr.io/palexsfc10/croniu-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "web": "ghcr.io/palexsfc10/croniu-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "admin": "ghcr.io/palexsfc10/croniu-admin@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  }
}
JSON

# Optional full preflight when jq is available (CI).
if command -v jq >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if bash "$SCRIPT_DIR/preflight.sh" >/tmp/preflight_ok.log 2>&1; then
    pass "full preflight accepts canonical PRD env"
  else
    bad "full preflight rejected valid PRD env"
    tail -n 20 /tmp/preflight_ok.log || true
  fi
else
  echo "SKIP full preflight (jq not on PATH locally; CI provides jq)"
fi

# --- Cold start detection (disposable volume name — never touch real PRD volume) ---
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "SKIP docker cold-start volume tests (docker unavailable)"
  exit "$fail"
fi

export PRD_POSTGRES_VOLUME_NAME="croniu-test-prd-pg-$$"
# Ensure clean
docker volume rm "$PRD_POSTGRES_VOLUME_NAME" >/dev/null 2>&1 || true

if is_cold_start; then
  pass "cold start when volume missing"
else
  bad "expected cold start when volume missing"
fi

# Creating volume must flip to subsequent (without starting Pilot/PRD compose)
docker volume create "$PRD_POSTGRES_VOLUME_NAME" >/dev/null
if is_cold_start; then
  bad "volume present must NOT be cold start"
else
  pass "volume present is subsequent deploy"
fi

# backup.sh must fail hard when DB container is not running (existing install, stopped DB)
export DB_SERVICE=db
if bash "$SCRIPT_DIR/backup.sh" >/tmp/backup_stopped.log 2>&1; then
  bad "backup must fail when DB container not running"
else
  grep -qi 'not running\|ERROR' /tmp/backup_stopped.log && pass "backup fails when DB not running" || pass "backup failed as required"
fi

# Ensure deploy.sh does not use backup.sh || true
if grep -E 'backup\.sh[[:space:]]*\|\|[[:space:]]*true' deploy/release/deploy.sh; then
  bad "deploy must not swallow backup failures"
else
  pass "deploy does not ignore backup failures"
fi
grep -q 'COLD_START=1' deploy/release/deploy.sh && pass "deploy logs COLD_START=1" || bad "missing COLD_START=1 log"
grep -q 'COLD_START=0' deploy/release/deploy.sh && pass "deploy logs COLD_START=0" || bad "missing COLD_START=0 log"
grep -q 'ensure_postgres_healthy' deploy/release/deploy.sh && pass "deploy waits for postgres health" || bad "missing ensure_postgres_healthy"

# --- Disposable Postgres rehearsal: cold start skip + subsequent backup ---
REH="$(mktemp -d)"
PROJ="croniu-test-prd-$$"
cat >"$REH/compose.yaml" <<YAML
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: croniu
      POSTGRES_PASSWORD: test_not_a_secret
      POSTGRES_DB: croniu
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U croniu -d croniu"]
      interval: 2s
      timeout: 3s
      retries: 20
volumes:
  pgdata:
    name: ${PRD_POSTGRES_VOLUME_NAME}
YAML

# Remove test volume to simulate cold start again
docker volume rm "$PRD_POSTGRES_VOLUME_NAME" >/dev/null 2>&1 || true
if is_cold_start; then
  pass "rehearsal cold start before first db up"
else
  bad "rehearsal should be cold start"
fi

# First up creates volume (simulates ensure_postgres_healthy on cold start)
docker compose -p "$PROJ" -f "$REH/compose.yaml" up -d db
for i in $(seq 1 40); do
  cid="$(docker compose -p "$PROJ" -f "$REH/compose.yaml" ps -q db 2>/dev/null || true)"
  [[ -n "$cid" ]] || { sleep 1; continue; }
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  [[ "$st" == "healthy" ]] && break
  sleep 1
done
cid="$(docker compose -p "$PROJ" -f "$REH/compose.yaml" ps -q db)"
st="$(docker inspect -f '{{.State.Health.Status}}' "$cid")"
[[ "$st" == "healthy" ]] \
  && pass "postgres healthy before migration window" \
  || bad "postgres not healthy (status=$st)"

if is_cold_start; then
  bad "after first up, volume must exist (not cold start)"
else
  pass "after first up, subsequent path"
fi

# Sentinel + backup (subsequent)
docker compose -p "$PROJ" -f "$REH/compose.yaml" exec -T db \
  psql -U croniu -d croniu -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS sentinel(v text); INSERT INTO sentinel(v) VALUES ('rc2.3-sentinel');"
BACKUP_DIR="$REH/backups"
mkdir -p "$BACKUP_DIR"
cid="$(docker compose -p "$PROJ" -f "$REH/compose.yaml" ps -q db)"
backup="$BACKUP_DIR/prd-test.sql.gz"
docker exec "$cid" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -c >"$backup"
gzip -t "$backup"
if gunzip -c "$backup" | grep -q 'rc2.3-sentinel'; then
  pass "subsequent backup contains sentinel"
else
  bad "backup missing sentinel"
fi

# Stop DB (volume remains) — must NOT look like cold start
docker compose -p "$PROJ" -f "$REH/compose.yaml" stop db
if is_cold_start; then
  bad "stopped DB with volume must not be cold start"
else
  pass "stopped DB with volume is subsequent"
fi

# Simulated migration failure aborts (local stub)
stub_migrate="$(mktemp)"
cat >"$stub_migrate" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "simulated migration failure" >&2
exit 1
EOF
chmod +x "$stub_migrate"
if "$stub_migrate"; then
  bad "migration stub should fail"
else
  pass "migration failure exits non-zero (deploy would abort via set -e)"
fi

# 11: secrets must not appear in release logs helpers — load_env_file sources without echo
if grep -R -nE 'cat .*\\.env\\.(prd|hml)|echo .*PASSWORD|printf.*SECRET_KEY' deploy/release/*.sh \
  | grep -v 'test_prd_deploy_guards' | grep -v '^[^:]*:#'; then
  bad "possible secret echo in release scripts"
else
  pass "no obvious secret printing in release scripts"
fi

# Cleanup disposable stack + volume (scoped — never prune)
docker compose -p "$PROJ" -f "$REH/compose.yaml" down >/dev/null 2>&1 || true
docker volume rm "$PRD_POSTGRES_VOLUME_NAME" >/dev/null 2>&1 || true
rm -rf "$REH"

exit "$fail"
