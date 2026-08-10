#!/usr/bin/env bash
# Deploy premium assistant UI + voice to HML. Preserves .env.hml.
set -euo pipefail
SHA="${1:?sha required}"
ROOT=/home/palex/ntws/croniu-hml
TGZ=/tmp/croniu-assistant-premium.tgz
BACKUP_DIR=/home/palex/ntws/backups/croniu-hml
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

echo "=== backup (migration present) ==="
mkdir -p "$BACKUP_DIR"
docker exec croniu-hml-db pg_dump -U croniu_hml croniu_hml | gzip -c > "$BACKUP_DIR/pre-assistant-voice_${STAMP}.sql.gz"
ls -lh "$BACKUP_DIR/pre-assistant-voice_${STAMP}.sql.gz"

echo "=== extract ==="
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
for f in deploy.sh healthcheck.sh rollback.sh _ops_deploy_assistant_premium_voice.sh _ops_probe_transcription_models.sh; do
  [[ -f $f ]] && sed -i 's/\r$//' "$f" && chmod +x "$f"
done

ENV_FILE="$ROOT/deploy/hml/.env.hml"
ensure_key() {
  local key="$1" val="$2"
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    echo "added $key"
  else
    echo "present $key"
  fi
}
ensure_key VOICE_ENABLED false
ensure_key OPENAI_TRANSCRIPTION_MODEL whisper-1
ensure_key VOICE_MAX_SECONDS 60
ensure_key VOICE_MAX_BYTES 4194304
ensure_key VOICE_TIMEOUT_SECONDS 45
ensure_key VOICE_USER_REQUESTS_PER_MINUTE 4
ensure_key VOICE_ORG_DAILY_REQUEST_LIMIT 80
ensure_key VOICE_COST_PER_MINUTE_CENTS 0.6

set -a; source .env.hml; set +a

echo "=== build api web admin ==="
docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$ROOT/backend/Dockerfile" "$ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$ROOT/apps/web/Dockerfile" "$ROOT/apps/web"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}" \
  -f "$ROOT/apps/admin/Dockerfile" "$ROOT/apps/admin"

echo "=== recreate api ==="
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done

echo "=== alembic upgrade ==="
docker exec croniu-hml-api alembic upgrade head
docker exec croniu-hml-api alembic current

echo "=== recreate web admin ==="
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-admin || true
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done

curl -sS http://127.0.0.1:18080/api/v1/agent/health; echo
curl -sS -o /dev/null -w "web_assistant=%{http_code}\n" http://127.0.0.1:13000/app/assistant || true
printf '%s\n' "$SHA" "feature=assistant-premium-ui-and-voice" "alembic=0016_agent_voice_usage" "deployed_at=$STAMP" > "$ROOT/DEPLOY_MARKER.txt"
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'croniu-hml|kyvora' || true
systemctl is-active smbd || true
systemctl is-active unifi || systemctl is-active unifi-core || true
echo DEPLOY_ASSISTANT_PREMIUM_DONE
