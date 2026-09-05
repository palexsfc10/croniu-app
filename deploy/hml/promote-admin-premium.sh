#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/palex/ntws/croniu-hml
TMP=/tmp/croniu-admin-premium-extract
SOURCE=/tmp/croniu-admin-premium-source.tgz
GIT_SHA=admin-premium-20260904
APP_VERSION="${CRONIU_VERSION:-v1.0.0-rc2.3}-admin-premium"

rm -rf "$TMP"
mkdir -p "$TMP"
tar -xzf "$SOURCE" -C "$TMP"
test -f "$TMP/apps/admin/Dockerfile"

docker tag croniu-hml-admin:local croniu-hml-admin:pre-admin-premium-20260904
rsync -a --delete --exclude node_modules --exclude .next "$TMP/apps/admin/" "$ROOT/apps/admin/"

cd "$ROOT/deploy/hml"
set -a
source .env.hml
set +a

docker build \
  --build-arg "GIT_SHA=$GIT_SHA" \
  --build-arg "APP_VERSION=$APP_VERSION" \
  --build-arg "BUILD_TIME=2026-09-04T00:00:00Z" \
  --build-arg "NEXT_PUBLIC_APP_VERSION=$APP_VERSION" \
  --build-arg "NEXT_PUBLIC_GIT_SHA=$GIT_SHA" \
  --build-arg "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" \
  --build-arg "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_ADMIN_URL" \
  --build-arg "API_PROXY_TARGET=http://api:8000" \
  -t croniu-hml-admin:local \
  -f "$ROOT/apps/admin/Dockerfile" \
  "$ROOT/apps/admin"

docker compose -p croniu-hml --env-file .env.hml -f compose.hml.yaml up -d --force-recreate --no-deps croniu-hml-admin

for i in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-admin 2>/dev/null || echo missing)
  echo "admin_health=$status try=$i"
  [[ "$status" == healthy ]] && break
  sleep 3
done

[[ "$(docker inspect -f '{{.State.Health.Status}}' croniu-hml-admin)" == healthy ]]
docker inspect croniu-hml-admin --format 'image={{.Image}} created={{.Created}} revision={{index .Config.Labels "org.opencontainers.image.revision"}} version={{index .Config.Labels "org.opencontainers.image.version"}}'
curl --max-time 15 -sS -o /dev/null -w 'admin_local=%{http_code}\n' http://127.0.0.1:13002/
curl --max-time 20 -sS -L -o /dev/null -w 'admin_public=%{http_code} url=%{url_effective}\n' https://admin-croniu-hml.ntws.cloud/
date -u +%Y%m%dT%H%M%SZ > /tmp/croniu-admin-premium-deployed-at.txt
