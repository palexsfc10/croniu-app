#!/usr/bin/env bash
# Surgical HML deploy: cycle↔agenda integrity invariant (API + web).
set -euo pipefail
SHA="${1:?sha}"
HML_ROOT="${HML_ROOT:-/home/palex/ntws/croniu-hml}"
COMPOSE="$HML_ROOT/deploy/hml/compose.hml.yaml"
ENV_FILE="$HML_ROOT/deploy/hml/.env.hml"
TGZ="${TGZ:-/tmp/croniu-cycle-agenda-integrity.tgz}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

ENV_VAL="$(docker exec croniu-hml-api printenv CRONIU_ENV 2>/dev/null || true)"
if [[ "$ENV_VAL" != "hml" ]]; then
  echo "REFUSING: CRONIU_ENV='$ENV_VAL' (expected hml)" >&2
  exit 1
fi

rm -rf /tmp/croniu-cycle-agenda-extract
mkdir -p /tmp/croniu-cycle-agenda-extract
tar -xzf "$TGZ" -C /tmp/croniu-cycle-agenda-extract
SRC=/tmp/croniu-cycle-agenda-extract
if [[ ! -d "$SRC/backend" ]]; then SRC=$(echo /tmp/croniu-cycle-agenda-extract/*/ | head -1); fi

rsync -a \
  --exclude 'deploy/hml/.env.hml' \
  --exclude 'node_modules' --exclude '.venv' --exclude '.next' --exclude '.git' \
  "$SRC/" "$HML_ROOT/"
echo "$SHA" > "$HML_ROOT/SOURCE_SHA.txt"

cd "$HML_ROOT/deploy/hml"
set -a; source .env.hml; set +a

docker build -t "${CRONIU_API_IMAGE:-croniu-hml-api:local}" -f "$HML_ROOT/backend/Dockerfile" "$HML_ROOT/backend"
docker build \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  --build-arg "NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}" \
  --build-arg "API_PROXY_TARGET=${API_PROXY_TARGET:-http://croniu-hml-api:8000}" \
  -t "${CRONIU_WEB_IMAGE:-croniu-hml-web:local}" \
  -f "$HML_ROOT/apps/web/Dockerfile" "$HML_ROOT/apps/web"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-api croniu-hml-web
for i in $(seq 1 60); do
  a=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-api 2>/dev/null || echo missing)
  w=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-web 2>/dev/null || echo missing)
  echo "api=$a web=$w try=$i"
  [[ "$a" == "healthy" && "$w" == "healthy" ]] && break
  sleep 3
done

printf '%s\n' "$SHA" "feature=cycle-agenda-integrity" "migration=none" "deployed_at=$STAMP" \
  > "$HML_ROOT/DEPLOY_MARKER.txt"
docker ps --format '{{.Names}} {{.Status}}' | grep croniu-hml || true
echo DEPLOY_CYCLE_AGENDA_INTEGRITY_DONE
