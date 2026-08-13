#!/usr/bin/env bash
# HML surgical deploy: RC2.9 PWA install banner (web only).
# No PRD. No migration. No API/Admin rebuild. Preserve cloudflared/db.
set -euo pipefail
SHA="${1:?sha}"
ROOT=/home/palex/ntws/croniu-hml
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SRC=/tmp/croniu-rc29-pwa-banner

set -a; source "$ROOT/deploy/hml/.env.hml"; set +a
BK="$ROOT/backups/croniu_hml_pre_rc29_banner_${STAMP}.sql.gz"
mkdir -p "$ROOT/backups"
docker exec croniu-hml-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip -c > "$BK"
echo "backup=$BK size=$(stat -c%s "$BK")"

install_file() {
  local rel="$1"
  install -D -m 644 "$SRC/$rel" "$ROOT/$rel"
  echo "installed $rel"
}

install_file apps/web/src/lib/pwa-install.ts
install_file apps/web/src/components/pwa/pwa-install-banner.tsx
install_file apps/web/src/components/app/app-shell.tsx

cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a

docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "NEXT_PUBLIC_APP_VERSION=v1.0.0-rc2.9-hml" \
  --build-arg "NEXT_PUBLIC_GIT_SHA=${SHA}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$ROOT/apps/web/Dockerfile" "$ROOT/apps/web"

# Preserve db/api/admin/cloudflared — recreate web only
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
test "$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web)" = "healthy"

# Preserve checks
docker inspect croniu-hml-api --format 'api={{.State.Status}}'
docker inspect croniu-hml-db --format 'db={{.State.Status}}'
docker inspect croniu-hml-cloudflared --format 'cf={{.State.Status}}' 2>/dev/null || true

# Asset + banner source probes (sanitized)
WEB_PORT="${WEB_HOST_PORT:-13000}"
curl -fsS -o /dev/null -w 'loopback_web=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/"
curl -fsS -o /dev/null -w 'icon_v3=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/icons/icon-192-v3.png"
curl -fsS -o /dev/null -w 'manifest=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/manifest.webmanifest"
curl -fsS -o /dev/null -w 'sw=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/sw.js"

# Confirm banner code is in the image (string present in built assets)
docker exec croniu-hml-web sh -lc 'grep -R -F "Tenha o Croniu sempre à mão" /app/.next 2>/dev/null | head -c 120 || true; echo; grep -R -F "croniu:pwa-install-banner:v1" /app/.next 2>/dev/null | head -c 80 || true; echo; grep -R -F "icon-192-v3.png" /app/.next 2>/dev/null | head -c 80 || true; echo'

# Public routes must not include AppShell banner host via login HTML shell (best-effort)
curl -fsS "http://127.0.0.1:${WEB_PORT}/login" | grep -qi 'pwa-install-banner' && echo 'WARN login has banner testid' || echo 'login_no_banner_testid=ok'

echo "RC29_HML_WEB_OK sha=$SHA"
