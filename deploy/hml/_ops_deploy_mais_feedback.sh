#!/usr/bin/env bash
# Deploy api+web+admin for Mais/account/feedback redesign (HML only).
set -euo pipefail
SHA="${1:?sha}"
ROOT=/home/palex/ntws/croniu-hml
TGZ=/tmp/croniu-mais-feedback.tgz
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

rm -rf /tmp/croniu-mais-feedback-extract
mkdir -p /tmp/croniu-mais-feedback-extract
tar -xzf "$TGZ" -C /tmp/croniu-mais-feedback-extract
SRC=/tmp/croniu-mais-feedback-extract
if [[ ! -d "$SRC/backend" ]]; then SRC=$(echo /tmp/croniu-mais-feedback-extract/*/ | head -1); fi
rsync -a \
  --exclude 'deploy/hml/.env.hml' \
  --exclude 'node_modules' --exclude '.venv' --exclude '.next' --exclude '.git' \
  "$SRC/" "$ROOT/"
echo "$SHA" > "$ROOT/SOURCE_SHA.txt"

cd "$ROOT/deploy/hml"
set -a; source .env.hml; set +a

docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$ROOT/backend/Dockerfile" "$ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$ROOT/apps/web/Dockerfile" "$ROOT/apps/web"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_ADMIN_URL:-https://admin-croniu-hml.ntws.cloud}" \
  -t "${CRONIU_ADMIN_IMAGE:-croniu-hml-admin:local}" \
  -f "$ROOT/apps/admin/Dockerfile" "$ROOT/apps/admin"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  echo "api_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done

# Apply migration 0017
docker exec croniu-hml-api alembic upgrade head
docker exec croniu-hml-api alembic current

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-web croniu-hml-admin
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "web_health=$st try=$i"
  [[ "$st" == "healthy" ]] && break
  sleep 3
done

curl -sS http://127.0.0.1:18080/api/v1/health; echo
printf '%s\n' "$SHA" "feature=mais-account-feedback" "migration=0017_user_feedbacks" "deployed_at=$STAMP" > "$ROOT/DEPLOY_MARKER.txt"
echo DEPLOY_MAIS_FEEDBACK_DONE
