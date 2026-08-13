#!/usr/bin/env bash
set -euo pipefail
# HML-only deploy: client intake journey (migration 0019 + api/web).
# Preserves DB volumes, .env.hml, cloudflared. No PRD. No Promote.
ROOT=/home/palex/ntws/croniu-hml
BACKUP_DIR=/home/palex/ntws/backups/croniu-hml
TGZ=/tmp/croniu-client-intake.tgz
SHA="${1:?usage: _ops_deploy_client_intake_journey.sh <sha>}"
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
BK="$BACKUP_DIR/pre-client-intake_${STAMP}.sql.gz"
docker exec croniu-hml-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip -c > "$BK"
ls -lh "$BK"
gzip -t "$BK"
echo "backup_ok sha_prev=$(cat "$ROOT/DEPLOY_MARKER.txt" 2>/dev/null | head -1 || echo unknown)"

echo "=== alembic before ==="
docker exec croniu-hml-api alembic current 2>&1 | tail -5 || true

echo "=== extract tree (preserve .env.hml) ==="
rm -rf /tmp/croniu-intake-extract
mkdir -p /tmp/croniu-intake-extract
tar -xzf "$TGZ" -C /tmp/croniu-intake-extract
SRC=/tmp/croniu-intake-extract
if [[ -d /tmp/croniu-intake-extract/backend ]]; then
  SRC=/tmp/croniu-intake-extract
elif [[ -d /tmp/croniu-intake-extract/*/backend ]]; then
  SRC=$(echo /tmp/croniu-intake-extract/*/ | head -1)
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
echo "feature=client-intake-journey" >> "$ROOT/DEPLOY_MARKER.txt"

echo "=== rebuild api+web+admin ==="
cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a
docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$ROOT/backend/Dockerfile" "$ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "NEXT_PUBLIC_APP_VERSION=client-intake-hml" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
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
curl -sS -o /dev/null -w 'intake_invalid=%{http_code}\n' "http://127.0.0.1:${API_HOST_PORT}/api/v1/public/intake/not-a-token" || true

echo "=== DONE client-intake HML sha=$SHA backup=$BK ==="
