#!/usr/bin/env bash
# Deploy API+web for pending-action hydration fix (HML only).
set -euo pipefail
test "$(docker exec croniu-hml-api printenv CRONIU_ENV)" = "hml"
HML=/home/palex/ntws/croniu-hml
install -m 644 /tmp/confirmation.py "$HML/backend/app/agent/confirmation.py"
install -m 644 /tmp/orchestrator.py "$HML/backend/app/agent/orchestrator.py"
install -m 644 /tmp/agent_api.py "$HML/backend/app/api/agent.py"
install -m 644 /tmp/assistant_page.tsx "$HML/apps/web/src/app/app/assistant/page.tsx"
cd "$HML/deploy/hml"
set -a; source .env.hml; set +a
docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$HML/backend/Dockerfile" "$HML/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$HML/apps/web/Dockerfile" "$HML/apps/web"
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done
curl -sS http://127.0.0.1:18080/health; echo
printf '%s\n' "$1" "feature=pending-action-hydration" "migration=none" "deployed_at=$(date -u +%Y%m%dT%H%M%SZ)" > "$HML/DEPLOY_MARKER.txt"
echo "$1" > "$HML/SOURCE_SHA.txt"
echo DEPLOY_PENDING_HYDRATION_DONE
