#!/usr/bin/env bash
# Deploy assistant premium UI + voice to Croniu HML only.
set -euo pipefail
ROOT="${1:-/home/palex/ntws/croniu-hml}"
cd "$ROOT"

MARKER="$ROOT/DEPLOY_MARKER.txt"
ENV_FILE="$ROOT/deploy/hml/.env.hml"
COMPOSE="$ROOT/deploy/hml/docker-compose.hml.yml"

echo "== preflight =="
test -f "$ENV_FILE"
test -f "$COMPOSE"
docker ps --format '{{.Names}}' | grep -q '^croniu-hml-api$' || { echo "api container missing"; exit 1; }

echo "== alembic upgrade =="
docker exec croniu-hml-api alembic upgrade head
docker exec croniu-hml-api alembic current

echo "== ensure voice env keys (no overwrite of secrets) =="
ensure_key() {
  local key="$1" val="$2"
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    echo "${key}=${val}" >> "$ENV_FILE"
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

echo "== rebuild api web admin =="
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" build api web admin
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate api web admin

sleep 8
echo "== health =="
curl -sS -o /tmp/hml_health.json -w "api_health_http=%{http_code}\n" http://127.0.0.1:18080/api/v1/health || true
curl -sS -o /tmp/agent_health.json -w "agent_health_http=%{http_code}\n" http://127.0.0.1:18080/api/v1/agent/health || true
curl -sS -o /dev/null -w "web_http=%{http_code}\n" http://127.0.0.1:13000/app/assistant || true
cat /tmp/agent_health.json; echo

SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
if [[ -z "$SHA" && -f "$ROOT/SOURCE_SHA.txt" ]]; then SHA="$(cat "$ROOT/SOURCE_SHA.txt")"; fi
{
  echo "${SHA:-unknown}"
  echo "feature=assistant-premium-ui-and-voice"
  echo "alembic=$(docker exec croniu-hml-api alembic current 2>/dev/null | awk 'NF{print $1; exit}')"
} > "$MARKER"
cat "$MARKER"
echo "DONE"
