#!/usr/bin/env bash
# Surgical HML deploy: agent thread limit (API service + web assistant page).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HML_ROOT="${HML_ROOT:-/home/palex/ntws/croniu-hml}"
COMPOSE="$HML_ROOT/deploy/hml/compose.hml.yaml"

ENV_VAL="$(docker exec croniu-hml-api printenv CRONIU_ENV 2>/dev/null || true)"
if [[ "$ENV_VAL" != "hml" ]]; then
  echo "ABORT: CRONIU_ENV='$ENV_VAL'" >&2
  exit 1
fi

echo "Syncing files into $HML_ROOT"
install -m 644 "$ROOT/backend/app/services/agent_threads.py" \
  "$HML_ROOT/backend/app/services/agent_threads.py"
install -m 644 "$ROOT/backend/tests/test_agent_thread_retention.py" \
  "$HML_ROOT/backend/tests/test_agent_thread_retention.py"
install -m 644 "$ROOT/apps/web/src/app/app/assistant/page.tsx" \
  "$HML_ROOT/apps/web/src/app/app/assistant/page.tsx"
install -m 644 "$ROOT/apps/web/src/app/app/assistant/page.test.tsx" \
  "$HML_ROOT/apps/web/src/app/app/assistant/page.test.tsx"
install -m 755 "$ROOT/deploy/hml/_ops_prune_agent_threads.sh" \
  "$HML_ROOT/deploy/hml/_ops_prune_agent_threads.sh"

cd "$HML_ROOT"
echo "Rebuilding api + web (no cache for touched layers)..."
docker compose -f "$COMPOSE" build api web
docker compose -f "$COMPOSE" up -d api web

echo "Waiting for API health..."
for i in $(seq 1 30); do
  if docker exec croniu-hml-api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" 2>/dev/null; then
    echo "API healthy"
    break
  fi
  sleep 2
done

date -u +"deployed_at=%Y%m%dT%H%M%SZ" >> "$HML_ROOT/DEPLOY_MARKER.txt"
echo "feature=assistant-thread-limit-5" >> "$HML_ROOT/DEPLOY_MARKER.txt"
echo "DONE"
