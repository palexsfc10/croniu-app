#!/usr/bin/env bash
# HML surgical deploy: public app entry modernization (web only).
# Preserves API/Admin/DB/cloudflared and deploy/hml/.env.hml.
set -euo pipefail
SHA="${1:?usage: _ops_deploy_public_entry.sh <sha>}"
ROOT=/home/palex/ntws/croniu-hml
TGZ=/tmp/croniu-public-entry.tgz
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

test -f "$ROOT/deploy/hml/.env.hml"
test -f "$TGZ"

rm -rf /tmp/croniu-public-entry-extract
mkdir -p /tmp/croniu-public-entry-extract
tar -xzf "$TGZ" -C /tmp/croniu-public-entry-extract
SRC=/tmp/croniu-public-entry-extract
if [[ ! -d "$SRC/apps/web" ]]; then SRC=$(echo /tmp/croniu-public-entry-extract/*/ | head -1); fi

rsync -a \
  --exclude 'deploy/hml/.env.hml' \
  --exclude 'node_modules' --exclude '.venv' --exclude '.next' --exclude '.git' \
  "$SRC/" "$ROOT/"
echo "$SHA" > "$ROOT/SOURCE_SHA.txt"

cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$ROOT/apps/web/Dockerfile" \
  "$ROOT/apps/web"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
test "$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web)" = "healthy"

WEB_PORT="${WEB_PORT:-13000}"
echo "== smokes =="
curl -fsS -o /tmp/public-entry.html -w 'loopback_web=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/"
curl -fsS -o /dev/null -w 'login=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/login"
curl -fsS -o /dev/null -w 'register=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/register"
curl -fsS -o /dev/null -w 'manifest=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/manifest.webmanifest"
curl -fsS -o /dev/null -w 'sw=%{http_code}\n' "http://127.0.0.1:${WEB_PORT}/sw.js"

python3 - <<'PY'
from pathlib import Path
html = Path('/tmp/public-entry.html').read_text(encoding='utf-8', errors='ignore')
assert 'Organize seus clientes' in html, 'missing title'
assert 'Simplifique sua rotina' in html, 'missing title line 2'
assert 'Criar minha conta' in html, 'missing register CTA'
assert 'Já tenho uma conta' in html, 'missing login CTA'
assert 'Sua rotina. Seus ciclos' not in html, 'old copy still present'
assert 'Começar' not in html or 'Criar minha conta' in html
print('copy_ok=1')
PY

printf '%s\n' "$SHA" "feature=public-app-entry-modernization" "migration=none" "deployed_at=$STAMP" > "$ROOT/DEPLOY_MARKER.txt"
docker ps --format '{{.Names}} {{.Status}}' | grep croniu-hml || true
echo DEPLOY_PUBLIC_ENTRY_DONE
