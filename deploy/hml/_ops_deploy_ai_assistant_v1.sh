#!/usr/bin/env bash
set -euo pipefail
# Deploy Assistente IA V1 to Croniu HML — preserves .env.hml, no prune, no volume wipe.
ROOT=/home/palex/ntws/croniu-hml
BACKUP_DIR=/home/palex/ntws/backups/croniu-hml
TGZ=/tmp/croniu-ai-assistant.tgz
SHA="${1:?usage: deploy_ai_assistant_hml.sh <sha>}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

echo "=== preflight ==="
hostname
df -h / | tail -1
free -h | head -2
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'croniu-hml|kyvora|samba|unifi' || true
test -f "$ROOT/deploy/hml/.env.hml"
test -f "$TGZ"

mkdir -p "$BACKUP_DIR"
echo "=== backup db ==="
docker exec croniu-hml-db pg_dump -U croniu_hml croniu_hml | gzip -c > "$BACKUP_DIR/pre-ai-assistant-v1_${STAMP}.sql.gz"
ls -lh "$BACKUP_DIR/pre-ai-assistant-v1_${STAMP}.sql.gz"

echo "=== alembic before ==="
docker exec croniu-hml-api alembic current 2>&1 | tail -3 || true

echo "=== extract tree (preserve .env.hml) ==="
rm -rf /tmp/croniu-ai-extract
mkdir -p /tmp/croniu-ai-extract
tar -xzf "$TGZ" -C /tmp/croniu-ai-extract
# archive may be flat or with top dir
SRC=/tmp/croniu-ai-extract
if [[ -d /tmp/croniu-ai-extract/backend ]]; then
  SRC=/tmp/croniu-ai-extract
elif [[ -d /tmp/croniu-ai-extract/*/backend ]]; then
  SRC=$(echo /tmp/croniu-ai-extract/*/ | head -1)
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
echo "feature=ai-assistant-v1" >> "$ROOT/DEPLOY_MARKER.txt"

ENV_FILE="$ROOT/deploy/hml/.env.hml"
ensure_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    echo "${key}=present"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    echo "${key}=appended"
  fi
}
# Degraded default: no key in HML yet
ensure_kv AI_ENABLED false
ensure_kv LLM_PROVIDER openai_responses
ensure_kv OPENAI_MODEL gpt-5.6-terra
ensure_kv AI_STORE_RESPONSES false
ensure_kv AI_USER_REQUESTS_PER_MINUTE 6
ensure_kv AI_ORG_DAILY_REQUEST_LIMIT 200
ensure_kv AI_CONFIRMATION_TTL_SECONDS 600
ensure_kv AI_MAX_INPUT_CHARS 4000
ensure_kv AI_MAX_TOOL_ROUNDS 6
ensure_kv AI_REQUEST_TIMEOUT_SECONDS 30
if grep -q '^OPENAI_API_KEY=' "$ENV_FILE"; then
  v=$(grep '^OPENAI_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [[ -z "$v" ]]; then echo OPENAI_API_KEY=EMPTY; else echo OPENAI_API_KEY=SET; fi
else
  printf '\nOPENAI_API_KEY=\n' >> "$ENV_FILE"
  echo OPENAI_API_KEY=appended_empty
fi

echo "=== rebuild api+web+admin ==="
cd "$ROOT/deploy/hml"
chmod +x deploy.sh healthcheck.sh rollback.sh || true
./deploy.sh up

echo "=== alembic after ==="
docker exec croniu-hml-api alembic current 2>&1 | tail -5

echo "=== health containers ==="
docker ps --format '{{.Names}} {{.Status}}' | grep croniu-hml || true
docker ps --format '{{.Names}}' | grep -Ei 'kyvora|samba|unifi' || true

echo "=== healthcheck script ==="
./healthcheck.sh || true

echo "=== agent status smoke ==="
curl -sS -o /tmp/agent_status.json -w '%{http_code}' https://api-croniu-hml.ntws.cloud/api/v1/agent/status || \
curl -sS -o /tmp/agent_status.json -w '%{http_code}' http://127.0.0.1:${API_HOST_PORT:-18080}/api/v1/agent/status || true
echo
# status may be 401 without auth — that's OK; confirm OpenAPI has agent paths
curl -sS http://127.0.0.1:${API_HOST_PORT:-18080}/openapi.json | python3 -c 'import sys,json; d=json.load(sys.stdin); paths=[p for p in d.get("paths",{}) if "agent" in p or "ai-ops" in p]; print("agent_paths", len(paths)); print("\n".join(sorted(paths)[:30]))'

echo "DONE sha=$SHA stamp=$STAMP"
