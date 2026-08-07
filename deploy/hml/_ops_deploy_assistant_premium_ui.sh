#!/usr/bin/env bash
# Rebuild/recreate only croniu-hml-web for assistant premium UI.
set -euo pipefail
SHA="${1:?sha}"
ROOT=/home/palex/ntws/croniu-hml
TGZ=/tmp/croniu-assistant-premium.tgz
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

rm -rf /tmp/croniu-assistant-premium-extract
mkdir -p /tmp/croniu-assistant-premium-extract
tar -xzf "$TGZ" -C /tmp/croniu-assistant-premium-extract
SRC=/tmp/croniu-assistant-premium-extract
if [[ ! -d "$SRC/backend" ]]; then SRC=$(echo /tmp/croniu-assistant-premium-extract/*/ | head -1); fi
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
  -f "$ROOT/apps/web/Dockerfile" "$ROOT/apps/web"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done

echo "== smoke page =="
curl -sS -o /tmp/asst_page.html -w 'assistant_page=%{http_code}\n' http://127.0.0.1:13000/app/assistant
curl -sS -o /tmp/prefs_page.html -w 'prefs_page=%{http_code}\n' http://127.0.0.1:13000/app/preferences

# Built client markers (assistant is client-rendered)
docker exec croniu-hml-web sh -c 'grep -Rsl "O que vamos organizar hoje" /app/.next/static 2>/dev/null | head -3' || true
docker exec croniu-hml-web sh -c 'grep -Rsl "Assistente Croniu" /app/.next/static 2>/dev/null | head -3 || echo NO_ASSISTENTE_CRONIU_IN_STATIC' || true
docker exec croniu-hml-web sh -c 'grep -Rsl "Nada é alterado sem sua confirmação" /app/.next/static 2>/dev/null | head -3' || true

printf '%s\n' "$SHA" "feature=assistant-premium-ui-compact" "web_only=true" "deployed_at=$STAMP" > "$ROOT/DEPLOY_MARKER.txt"
docker ps --format '{{.Names}} {{.Status}}' | grep croniu-hml || true
echo DEPLOY_ASSISTANT_PREMIUM_UI_DONE
