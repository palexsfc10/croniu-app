#!/usr/bin/env bash
# HML surgical deploy: RC2.8 PWA official icons + billing trial UX (api+web).
# No PRD. No migration. No admin rebuild unless icons needed there too.
set -euo pipefail
SHA="${1:?sha}"
ROOT=/home/palex/ntws/croniu-hml
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SRC=/tmp/croniu-rc28-pwa-patch

set -a; source "$ROOT/deploy/hml/.env.hml"; set +a
BK="$ROOT/backups/croniu_hml_pre_rc28_pwa_${STAMP}.sql.gz"
mkdir -p "$ROOT/backups"
docker exec croniu-hml-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip -c > "$BK"
echo "backup=$BK size=$(stat -c%s "$BK")"

install_file() {
  local rel="$1"
  install -D -m 644 "$SRC/$rel" "$ROOT/$rel"
  echo "installed $rel"
}

# Backend billing UX
install_file backend/app/billing/entitlement.py

# Web billing UX + PWA contract
install_file apps/web/src/lib/billing-labels.ts
install_file apps/web/src/app/app/billing/page.tsx
install -D -m 644 "$SRC/apps/web/src/app/app/billing/return/[mode]/page.tsx" \
  "$ROOT/apps/web/src/app/app/billing/return/[mode]/page.tsx"
echo "installed apps/web/src/app/app/billing/return/[mode]/page.tsx"
install_file apps/web/src/components/brand/brand-mark.tsx
install_file apps/web/public/manifest.webmanifest
install_file apps/web/public/sw.js
install_file apps/web/src/app/icon.png
install_file apps/web/src/app/apple-icon.png
install_file apps/web/src/app/favicon.ico

# Official source + versioned icons
install_file assets/brand/croniu-c-official.png
mkdir -p "$ROOT/apps/web/public/icons"
install_file apps/web/public/icons/icon-192-v3.png
install_file apps/web/public/icons/icon-512-v3.png
install_file apps/web/public/icons/icon-512-maskable-v3.png
install_file apps/web/public/icons/ICON_MANIFEST_v3.json
# Remove legacy unversioned icons if present
rm -f "$ROOT/apps/web/public/icons/icon-192.png" "$ROOT/apps/web/public/icons/icon-512.png"

cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a

docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$ROOT/backend/Dockerfile" "$ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$ROOT/apps/web/Dockerfile" "$ROOT/apps/web"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
test "$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api)" = "healthy"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
test "$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web)" = "healthy"

# External asset probes (sanitized)
for path in \
  /icons/icon-192-v3.png \
  /icons/icon-512-v3.png \
  /icons/icon-512-maskable-v3.png \
  /manifest.webmanifest \
  /sw.js
do
  code=$(curl -sS -o /tmp/hml_asset.bin -w '%{http_code}' "http://127.0.0.1:13000$path")
  ctype=$(file -b --mime-type /tmp/hml_asset.bin 2>/dev/null || echo unknown)
  echo "asset path=$path http=$code mime=$ctype bytes=$(wc -c </tmp/hml_asset.bin)"
  test "$code" = "200"
done

# Prove legacy paths gone or not referenced
python3 - <<'PY'
import json, pathlib
m=json.loads(pathlib.Path('/home/palex/ntws/croniu-hml/apps/web/public/manifest.webmanifest').read_text())
srcs=[i['src'] for i in m['icons']]
assert srcs == [
  '/icons/icon-192-v3.png',
  '/icons/icon-512-v3.png',
  '/icons/icon-512-maskable-v3.png',
], srcs
print('manifest_ok', srcs)
PY

curl -sS -o /dev/null -w 'api=%{http_code}\n' http://127.0.0.1:18080/health
curl -sS -o /dev/null -w 'web=%{http_code}\n' http://127.0.0.1:13000/
curl -sS -o /dev/null -w 'admin=%{http_code}\n' http://127.0.0.1:13002/

echo "rc28_pwa_patch=$SHA deployed_at=$STAMP" >> "$ROOT/DEPLOY_MARKER.txt"
echo DEPLOY_RC28_PWA_DONE
