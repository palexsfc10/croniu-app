#!/usr/bin/env bash
set -euo pipefail
# HML-only deploy: Google Sign-In (migration 0025 + api/web).
# Feature stays OFF unless GOOGLE_OAUTH_ENABLED=true and both
# GOOGLE_OAUTH_CLIENT_ID / NEXT_PUBLIC_GOOGLE_CLIENT_ID are set in
# .env.hml — this script does not turn the flag on by itself, and does not
# invent or write any credential. See deploy/hml/README.md and
# docs/GOOGLE_AUTH.md for the enable procedure.
# Preserves DB volumes, .env.hml, cloudflared. No PRD. No Promote.
ROOT=/home/palex/ntws/croniu-hml
BACKUP_DIR=/home/palex/ntws/backups/croniu-hml
TGZ=/tmp/croniu-google-auth.tgz
SHA="${1:?usage: _ops_deploy_google_auth.sh <sha>}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

echo "=== preflight ==="
hostname
df -h / | tail -1
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'croniu-hml' || true
test -f "$ROOT/deploy/hml/.env.hml"
test -f "$TGZ"

mkdir -p "$BACKUP_DIR"
echo "=== backup db ==="
set -a; source "$ROOT/deploy/hml/.env.hml"; set +a
BK="$BACKUP_DIR/pre-google-auth_${STAMP}.sql.gz"
docker exec croniu-hml-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip -c > "$BK"
ls -lh "$BK"
gzip -t "$BK"
echo "backup_ok sha_prev=$(cat "$ROOT/DEPLOY_MARKER.txt" 2>/dev/null | head -1 || echo unknown)"

echo "=== alembic before ==="
docker exec croniu-hml-api alembic current 2>&1 | tail -5 || true

echo "=== extract tree (preserve .env.hml) ==="
rm -rf /tmp/croniu-google-auth-extract
mkdir -p /tmp/croniu-google-auth-extract
tar -xzf "$TGZ" -C /tmp/croniu-google-auth-extract
SRC=/tmp/croniu-google-auth-extract
if [[ -d /tmp/croniu-google-auth-extract/backend ]]; then
  SRC=/tmp/croniu-google-auth-extract
elif [[ -d /tmp/croniu-google-auth-extract/*/backend ]]; then
  SRC=$(echo /tmp/croniu-google-auth-extract/*/ | head -1)
fi
rsync -a --delete \
  --exclude 'deploy/hml/.env.hml' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude '.next' \
  --exclude '.git' \
  "$SRC/" "$ROOT/"

echo "$SHA" > "$ROOT/DEPLOY_MARKER.txt"
echo "deployed_at=$STAMP" >> "$ROOT/DEPLOY_MARKER.txt"
echo "feature=google-auth-professional-onboarding" >> "$ROOT/DEPLOY_MARKER.txt"

echo "=== rebuild api+web+admin ==="
cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a
docker build \
  --build-arg "GIT_SHA=${SHA}" \
  --build-arg "APP_VERSION=google-auth-hml" \
  --build-arg "BUILD_TIME=${STAMP}" \
  -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" \
  -f "$ROOT/backend/Dockerfile" \
  "$ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "NEXT_PUBLIC_APP_VERSION=google-auth-hml" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  --build-arg "NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$ROOT/apps/web/Dockerfile" \
  "$ROOT/apps/web"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_ADMIN_URL}" \
  -t "${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}" \
  -f "$ROOT/apps/admin/Dockerfile" \
  "$ROOT/apps/admin"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
test "$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api)" = "healthy"

echo "=== alembic upgrade ==="
docker exec croniu-hml-api alembic upgrade head
docker exec croniu-hml-api alembic current
docker exec croniu-hml-api alembic heads

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web croniu-hml-admin
for svc in croniu-hml-web croniu-hml-admin; do
  for i in $(seq 1 40); do
    st=$(docker inspect -f '{{.State.Health.Status}}' "$svc" 2>/dev/null || echo missing)
    [[ "$st" == "healthy" ]] && break
    sleep 3
  done
  test "$(docker inspect -f '{{.State.Health.Status}}' "$svc")" = "healthy"
done

echo "=== preserve checks ==="
docker inspect croniu-hml-db --format 'db={{.State.Status}}'
docker inspect croniu-hml-cloudflared --format 'cf={{.State.Status}}' 2>/dev/null || true

echo "=== smoke api ==="
curl -sS -o /dev/null -w 'health=%{http_code}\n' "http://127.0.0.1:${API_HOST_PORT}/health"
curl -sS "http://127.0.0.1:${API_HOST_PORT}/version" || true
# 404 expected while GOOGLE_OAUTH_ENABLED is unset/false (flag stays off by
# default); 401 once the flag + credentials are on and this request has no
# real Google credential — either is a sign the route is wired correctly.
curl -sS -o /dev/null -w 'auth_google_probe=%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' -d '{"credential":"probe-not-a-real-token-000000"}' \
  "http://127.0.0.1:${API_HOST_PORT}/api/v1/auth/google" || true

echo "=== DONE google-auth HML sha=$SHA backup=$BK ==="
